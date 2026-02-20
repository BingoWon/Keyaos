/**
 * Asynchronous Billing Service — Dual-mode cost calculation
 *
 * Mode 1: If upstream returns cost (OpenRouter/DeepInfra), use it directly.
 * Mode 2: If not (ZenMux), calculate from models table pricing × tokens.
 *
 * buyer_cost = upstream_cost + platform_fee
 * seller_income = upstream_cost (what the seller's key was worth)
 * platform_fee = upstream_cost × platform_fee_ratio
 */

import { Config } from "./config";
import { TransactionsDao } from "./db/transactions-dao";
import { UsersDao } from "./db/users-dao";
import type { TokenUsage } from "./utils/stream";

export interface BillingParams {
	buyerId: string;
	keyId: string;
	provider: string;
	model: string;
	priceRatio: number;
	modelCost: { inputCentsPerM: number; outputCentsPerM: number };
	usage: TokenUsage;
}

export async function recordTransaction(
	db: D1Database,
	params: BillingParams,
): Promise<void> {
	const { buyerId, keyId, provider, model, priceRatio, modelCost, usage } =
		params;
	const totalTokens =
		usage.total_tokens || usage.prompt_tokens + usage.completion_tokens;

	if (totalTokens <= 0) return;

	// ─── Determine upstream cost ───────────────────────────
	let upstreamCostCents: number;

	const reportedCostUsd = usage.cost ?? usage.estimated_cost;
	if (reportedCostUsd != null && reportedCostUsd > 0) {
		upstreamCostCents = Math.ceil(reportedCostUsd * 100);
	} else {
		const inputCost =
			(usage.prompt_tokens / 1_000_000) * modelCost.inputCentsPerM;
		const outputCost =
			(usage.completion_tokens / 1_000_000) * modelCost.outputCentsPerM;
		upstreamCostCents = Math.ceil(inputCost + outputCost);
	}

	// ─── Calculate costs ───────────────────────────────────
	// Seller income = upstream cost × price_ratio (what they're willing to sell for)
	const sellerIncomeCents = Math.max(
		Math.ceil(upstreamCostCents * priceRatio),
		1,
	);
	// Platform fee = seller income × fee ratio
	const platformFeeCents = Math.ceil(
		sellerIncomeCents * Config.PLATFORM_FEE_RATIO,
	);
	// Buyer pays = seller income + platform fee
	const costCents = sellerIncomeCents + platformFeeCents;

	try {
		await new TransactionsDao(db).createTransaction({
			buyer_id: buyerId,
			key_id: keyId,
			provider,
			model,
			input_tokens: usage.prompt_tokens,
			output_tokens: usage.completion_tokens,
			upstream_cost_cents: upstreamCostCents,
			cost_cents: costCents,
			seller_income_cents: sellerIncomeCents,
			platform_fee_cents: platformFeeCents,
		});

		const deducted = await new UsersDao(db).deductBalance(buyerId, costCents);
		if (!deducted) {
			console.warn(
				`[BILLING] Insufficient funds for ${buyerId}: ${costCents}c`,
			);
		}
	} catch (err) {
		console.error("[BILLING] Transaction write failed:", err);
	}
}

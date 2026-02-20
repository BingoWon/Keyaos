/**
 * Asynchronous Billing Service — Dual-mode cost calculation
 *
 * Mode 1: If upstream returns cost (OpenRouter/DeepInfra), use it directly.
 * Mode 2: If not (ZenMux), calculate from models table pricing × tokens.
 *
 * Final buyer cost = upstream_cost × price_ratio + platform_fee
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

export async function recordTransactionTx(
	db: D1Database,
	params: BillingParams,
): Promise<void> {
	const { buyerId, keyId, provider, model, priceRatio, modelCost, usage } =
		params;
	const totalTokens =
		usage.total_tokens || usage.prompt_tokens + usage.completion_tokens;

	if (totalTokens <= 0) return;

	// ─── Determine upstream cost ───────────────────────────
	// Priority: upstream-reported cost > calculated from models table
	let upstreamCostCents: number;

	const reportedCostUsd = usage.cost ?? usage.estimated_cost;
	if (reportedCostUsd != null && reportedCostUsd > 0) {
		// OpenRouter/DeepInfra: convert USD to cents, round up
		upstreamCostCents = Math.ceil(reportedCostUsd * 100);
	} else {
		// ZenMux: calculate from models table pricing
		const inputCost =
			(usage.prompt_tokens / 1_000_000) * modelCost.inputCentsPerM;
		const outputCost =
			(usage.completion_tokens / 1_000_000) * modelCost.outputCentsPerM;
		upstreamCostCents = Math.ceil(inputCost + outputCost);
	}

	// ─── Calculate buyer cost ──────────────────────────────
	const costCents = Math.max(
		Math.ceil(upstreamCostCents * priceRatio * (1 + Config.PLATFORM_FEE_RATIO)),
		1,
	);
	const platformFeeCents = Math.ceil(costCents * Config.PLATFORM_FEE_RATIO);
	const sellerIncomeCents = costCents - platformFeeCents;

	const usersDao = new UsersDao(db);
	const txDao = new TransactionsDao(db);

	try {
		await txDao.createTransaction({
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

		const deducted = await usersDao.deductBalance(buyerId, costCents);
		if (!deducted) {
			console.warn(
				`[BILLING] Insufficient funds for ${buyerId}: ${costCents}c`,
			);
		}
	} catch (err) {
		console.error("[BILLING] Transaction write failed:", err);
	}
}

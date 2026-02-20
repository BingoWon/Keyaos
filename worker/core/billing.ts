/**
 * Billing — Core mode: usage tracking + key credit deduction
 *
 * No marketplace pricing in core mode. Simply records:
 * - upstream cost (what the provider charged)
 * - token usage (for analytics)
 * Then deducts credits from the key.
 */

import { KeysDao } from "./db/keys-dao";
import { TransactionsDao } from "./db/transactions-dao";
import type { TokenUsage } from "./utils/stream";

export interface BillingParams {
	keyId: string;
	provider: string;
	model: string;
	modelCost: { inputCentsPerM: number; outputCentsPerM: number };
	usage: TokenUsage;
}

export async function recordUsage(
	db: D1Database,
	params: BillingParams,
): Promise<void> {
	const { keyId, provider, model, modelCost, usage } = params;
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

	try {
		// Record transaction for analytics
		await new TransactionsDao(db).createTransaction({
			buyer_id: "owner",
			key_id: keyId,
			provider,
			model,
			input_tokens: usage.prompt_tokens,
			output_tokens: usage.completion_tokens,
			upstream_cost_cents: upstreamCostCents,
			cost_cents: upstreamCostCents,
			seller_income_cents: 0,
			platform_fee_cents: 0,
		});

		// Deduct credits from the key (auto-deactivates at 0)
		await new KeysDao(db).deductCredits(keyId, upstreamCostCents);
	} catch (err) {
		console.error("[BILLING] Transaction write failed:", err);
	}
}

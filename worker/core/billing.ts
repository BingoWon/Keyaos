/**
 * Billing — usage tracking + upstream key credit deduction
 */

import { LedgerDao } from "./db/ledger-dao";
import { UpstreamKeysDao } from "./db/upstream-keys-dao";
import type { TokenUsage } from "./utils/stream";

export interface BillingParams {
	ownerId: string;
	upstreamKeyId: string;
	provider: string;
	model: string;
	modelPrice: { inputPricePerM: number; outputPricePerM: number };
	usage: TokenUsage;
}

export async function recordUsage(
	db: D1Database,
	params: BillingParams,
): Promise<void> {
	const { ownerId, upstreamKeyId, provider, model, modelPrice, usage } = params;
	const totalTokens =
		usage.total_tokens || usage.prompt_tokens + usage.completion_tokens;

	if (totalTokens <= 0) return;

	let creditsToDeduct: number;

	const reportedCostUsd = usage.cost ?? usage.estimated_cost;
	if (reportedCostUsd != null && reportedCostUsd > 0) {
		creditsToDeduct = reportedCostUsd * 100;
	} else {
		const inputPrice =
			(usage.prompt_tokens / 1_000_000) * modelPrice.inputPricePerM;
		const outputPrice =
			(usage.completion_tokens / 1_000_000) * modelPrice.outputPricePerM;
		creditsToDeduct = inputPrice + outputPrice;
	}

	try {
		await new LedgerDao(db).createEntry({
			owner_id: ownerId,
			upstream_key_id: upstreamKeyId,
			provider,
			model,
			input_tokens: usage.prompt_tokens,
			output_tokens: usage.completion_tokens,
			credits_used: creditsToDeduct,
		});

		await new UpstreamKeysDao(db).deductQuota(upstreamKeyId, creditsToDeduct);
	} catch (err) {
		console.error("[BILLING] Ledger write failed:", err);
	}
}

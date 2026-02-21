/**
 * Billing — Core mode: usage tracking + key credit deduction
 */

import { LedgerDao } from "./db/ledger-dao";
import { QuotasDao } from "./db/quotas-dao";
import type { TokenUsage } from "./utils/stream";

export interface BillingParams {
	ownerId: string;
	listingId: string;
	provider: string;
	model: string;
	modelPrice: { inputPricePerM: number; outputPricePerM: number };
	usage: TokenUsage;
}

export async function recordUsage(
	db: D1Database,
	params: BillingParams,
): Promise<void> {
	const { ownerId, listingId, provider, model, modelPrice, usage } = params;
	const totalTokens =
		usage.total_tokens || usage.prompt_tokens + usage.completion_tokens;

	if (totalTokens <= 0) return;

	// Determine quota / credits to deduct
	let creditsToDeduct: number;

	const reportedCostUsd = usage.cost ?? usage.estimated_cost;
	if (reportedCostUsd != null && reportedCostUsd > 0) {
		// If USD cost is directly reported by upstream, we map 1 USD = 100 Credits (or whatever custom factor)
		// For simplicity, we convert reported cost assuming 1 Credit = 1 Cent of USD.
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
			listing_id: listingId,
			provider,
			model,
			input_tokens: usage.prompt_tokens,
			output_tokens: usage.completion_tokens,
			credits_used: creditsToDeduct,
		});

		await new QuotasDao(db).deductQuota(listingId, creditsToDeduct);
	} catch (err) {
		console.error("[BILLING] Ledger write failed:", err);
	}
}

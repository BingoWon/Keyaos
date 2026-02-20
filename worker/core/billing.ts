/**
 * Billing — Core mode: usage tracking + key credit deduction
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

	// Determine cost in cents
	let costCents: number;

	const reportedCostUsd = usage.cost ?? usage.estimated_cost;
	if (reportedCostUsd != null && reportedCostUsd > 0) {
		costCents = Math.ceil(reportedCostUsd * 100);
	} else {
		const inputCost =
			(usage.prompt_tokens / 1_000_000) * modelCost.inputCentsPerM;
		const outputCost =
			(usage.completion_tokens / 1_000_000) * modelCost.outputCentsPerM;
		costCents = Math.ceil(inputCost + outputCost);
	}

	try {
		await new TransactionsDao(db).createTransaction({
			key_id: keyId,
			provider,
			model,
			input_tokens: usage.prompt_tokens,
			output_tokens: usage.completion_tokens,
			cost_cents: costCents,
		});

		await new KeysDao(db).deductCredits(keyId, costCents);
	} catch (err) {
		console.error("[BILLING] Transaction write failed:", err);
	}
}

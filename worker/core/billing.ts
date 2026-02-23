/**
 * Core billing — usage tracking + upstream credential quota deduction.
 *
 * Platform-specific wallet settlement is handled separately
 * in worker/platform/billing/settlement.ts.
 */

import type { Settlement } from "../platform/billing/settlement";
import { CredentialsDao } from "./db/credentials-dao";
import { LedgerDao } from "./db/ledger-dao";
import type { TokenUsage } from "./utils/stream";

export interface BillingParams {
	consumerId: string;
	credentialId: string;
	credentialOwnerId: string;
	provider: string;
	model: string;
	modelPrice: { inputPricePerM: number; outputPricePerM: number };
	usage: TokenUsage;
	settlement: Settlement;
}

export function calculateBaseCost(
	modelPrice: { inputPricePerM: number; outputPricePerM: number },
	usage: TokenUsage,
): number {
	const reportedCost = usage.cost ?? usage.estimated_cost;
	if (reportedCost != null && reportedCost > 0) return reportedCost;

	const inputCost =
		(usage.prompt_tokens / 1_000_000) * modelPrice.inputPricePerM;
	const outputCost =
		(usage.completion_tokens / 1_000_000) * modelPrice.outputPricePerM;
	return inputCost + outputCost;
}

export async function recordUsage(
	db: D1Database,
	params: BillingParams,
): Promise<void> {
	const {
		consumerId,
		credentialId,
		credentialOwnerId,
		provider,
		model,
		modelPrice,
		usage,
		settlement,
	} = params;

	const totalTokens =
		usage.total_tokens || usage.prompt_tokens + usage.completion_tokens;
	if (totalTokens <= 0) return;

	const baseCost = calculateBaseCost(modelPrice, usage);

	try {
		await new LedgerDao(db).createEntry({
			consumer_id: consumerId,
			credential_id: credentialId,
			credential_owner_id: credentialOwnerId,
			provider,
			model,
			input_tokens: usage.prompt_tokens,
			output_tokens: usage.completion_tokens,
			base_cost: baseCost,
			consumer_charged: settlement.consumerCharged,
			provider_earned: settlement.providerEarned,
			platform_fee: settlement.platformFee,
		});

		await new CredentialsDao(db).deductQuota(credentialId, baseCost);
	} catch (err) {
		console.error("[BILLING] Ledger write failed:", err);
	}
}

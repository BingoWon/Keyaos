/**
 * Core billing — log recording + upstream credential quota deduction.
 *
 * Platform-specific wallet settlement is handled separately
 * in worker/platform/billing/settlement.ts.
 */

import { log } from "../shared/logger";
import type { Settlement } from "../shared/types";
import { CredentialsDao } from "./db/credentials-dao";
import { LogsDao } from "./db/logs-dao";
import type { TokenUsage } from "./utils/stream";

export interface BillingParams {
	consumerId: string;
	credentialId: string;
	credentialOwnerId: string;
	provider: string;
	model: string;
	baseCost: number;
	inputTokens: number;
	outputTokens: number;
	priceMultiplier: number;
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

export async function recordLog(
	db: D1Database,
	params: BillingParams,
): Promise<void> {
	const {
		consumerId,
		credentialId,
		credentialOwnerId,
		provider,
		model,
		baseCost,
		inputTokens,
		outputTokens,
		priceMultiplier,
		settlement,
	} = params;

	if (inputTokens + outputTokens <= 0) return;

	try {
		await new LogsDao(db).createEntry({
			consumer_id: consumerId,
			credential_id: credentialId,
			credential_owner_id: credentialOwnerId,
			provider,
			model,
			input_tokens: inputTokens,
			output_tokens: outputTokens,
			base_cost: baseCost,
			consumer_charged: settlement.consumerCharged,
			provider_earned: settlement.providerEarned,
			platform_fee: settlement.platformFee,
			price_multiplier: priceMultiplier,
		});

		await new CredentialsDao(db).deductQuota(credentialId, baseCost);
	} catch (err) {
		log.error("billing", "Log entry write failed", {
			credentialId,
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

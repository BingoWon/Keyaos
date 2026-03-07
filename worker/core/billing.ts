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
	providerId: string;
	modelId: string;
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
	encryptionKey: string,
	params: BillingParams,
): Promise<void> {
	const {
		consumerId,
		credentialId,
		credentialOwnerId,
		providerId,
		modelId,
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
			provider_id: providerId,
			model_id: modelId,
			input_tokens: inputTokens,
			output_tokens: outputTokens,
			base_cost: baseCost,
			consumer_charged: settlement.consumerCharged,
			provider_earned: settlement.providerEarned,
			platform_fee: settlement.platformFee,
			price_multiplier: priceMultiplier,
			status: "ok",
			error_code: null,
		});

		await new CredentialsDao(db, encryptionKey).deductQuota(
			credentialId,
			baseCost,
		);
	} catch (err) {
		log.error("billing", "Log entry write failed", {
			credentialId,
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

/** Record a failed upstream attempt (no quota deduction, no settlement). */
export async function recordFailureLog(
	db: D1Database,
	params: {
		consumerId: string;
		credentialId: string;
		credentialOwnerId: string;
		providerId: string;
		modelId: string;
		priceMultiplier: number;
		errorCode: number;
	},
): Promise<void> {
	try {
		await new LogsDao(db).createEntry({
			consumer_id: params.consumerId,
			credential_id: params.credentialId,
			credential_owner_id: params.credentialOwnerId,
			provider_id: params.providerId,
			model_id: params.modelId,
			input_tokens: 0,
			output_tokens: 0,
			base_cost: 0,
			consumer_charged: 0,
			provider_earned: 0,
			platform_fee: 0,
			price_multiplier: params.priceMultiplier,
			status: "error",
			error_code: params.errorCode,
		});
	} catch (err) {
		log.error("billing", "Failure log write failed", {
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

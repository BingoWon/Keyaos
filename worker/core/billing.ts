/**
 * Asynchronous Billing Service
 *
 * Records token usage out-of-band to D1 and deducts buyer balance.
 * Usage: c.executionCtx.waitUntil(recordTransactionTx(...))
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
	usage: TokenUsage;
}

export async function recordTransactionTx(
	db: D1Database,
	params: BillingParams,
): Promise<void> {
	const { buyerId, keyId, provider, model, usage } = params;
	const totalTokens =
		usage.total_tokens || usage.prompt_tokens + usage.completion_tokens;

	if (totalTokens <= 0) return;

	// MVP Flat Rate: Convert total tokens to Cents (rounded up to avoid 0c transactions)
	const costCents = Math.ceil(
		(Math.max(totalTokens, 1) / 1_000_000) *
			Config.USAGE_RATE_PER_MILLION_CENTS,
	);

	// Calculate fractional platform revenue
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
			cost_cents: costCents,
			seller_income_cents: sellerIncomeCents,
			platform_fee_cents: platformFeeCents,
		});

		const deducted = await usersDao.deductBalance(buyerId, costCents);
		if (!deducted) {
			console.warn(
				`[BILLING] Insufficient funds or invalid user: ${buyerId}. Failed to deduct ${costCents}c.`,
			);
		}
	} catch (err) {
		console.error("[BILLING] Database transaction write failed:", err);
	}
}

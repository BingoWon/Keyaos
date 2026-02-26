/**
 * Auto Top-Up service — handles real-time triggers and cron sweeps.
 *
 * Trigger flow:
 *   1. claimTrigger() atomically sets last_triggered_at (prevents concurrent fires)
 *   2. Create off-session PaymentIntent via Stripe
 *   3. On success: create payment record, credit wallet, reset failures
 *   4. On failure: create failed payment record, increment failures
 *
 * Progressive backoff: immediate → 1h → 24h → pause (3 strikes)
 */

import { log } from "../../shared/logger";
import { AutoTopUpDao } from "./auto-topup-dao";
import { PaymentsDao } from "./payments-dao";
import { centsToCredits, createOffSessionPayment } from "./stripe";
import { WalletDao } from "./wallet-dao";

export async function triggerAutoTopUp(
	db: D1Database,
	stripeSecretKey: string,
	ownerId: string,
): Promise<void> {
	const dao = new AutoTopUpDao(db);
	const wallets = new WalletDao(db);

	const config = await dao.getConfig(ownerId);
	if (!config || !dao.canTrigger(config)) return;

	const wallet = await wallets.get(ownerId);
	if (!wallet?.stripe_customer_id) return;
	if (wallet.balance >= config.threshold) return;

	if (!(await dao.claimTrigger(ownerId))) return;

	try {
		const pi = await createOffSessionPayment({
			secretKey: stripeSecretKey,
			customerId: wallet.stripe_customer_id,
			paymentMethodId: config.payment_method_id as string,
			amountCents: config.amount_cents,
			ownerId,
		});

		const payments = new PaymentsDao(db);

		if (pi.status === "succeeded") {
			const credits = centsToCredits(config.amount_cents);
			await payments.create({
				owner_id: ownerId,
				type: "auto",
				stripe_session_id: pi.id,
				amount_cents: config.amount_cents,
				credits,
				status: "completed",
			});
			await wallets.credit(ownerId, credits);
			await dao.recordSuccess(ownerId);
			log.info("auto-topup", `Charged $${credits} for ${ownerId}`);
		} else {
			await payments.create({
				owner_id: ownerId,
				type: "auto",
				stripe_session_id: pi.id,
				amount_cents: config.amount_cents,
				credits: 0,
				status: "failed",
			});
			await dao.recordFailure(ownerId, pi.status);
			log.warn("auto-topup", `Payment ${pi.status} for ${ownerId}`);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await dao.recordFailure(ownerId, msg);
		log.error("auto-topup", `Failed for ${ownerId}: ${msg}`);
	}
}

export async function sweepAutoTopUp(
	db: D1Database,
	stripeSecretKey: string | undefined,
): Promise<void> {
	if (!stripeSecretKey) return;

	const candidates = await new AutoTopUpDao(db).findEligible();
	if (candidates.length === 0) return;

	log.info("auto-topup", `Sweep: ${candidates.length} eligible`);

	for (const row of candidates) {
		await triggerAutoTopUp(db, stripeSecretKey, row.owner_id);
	}
}

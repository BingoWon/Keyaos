import { Hono } from "hono";
import { BadRequestError } from "../../shared/errors";
import { log } from "../../shared/logger";
import type { AppEnv } from "../../shared/types";
import { AutoTopUpDao } from "../billing/auto-topup-dao";
import { PaymentsDao } from "../billing/payments-dao";
import {
	centsToCredits,
	createCheckoutSession,
	createCustomer,
	getPaymentIntent,
	type StripeCheckoutEvent,
	verifyWebhookSignature,
} from "../billing/stripe";
import { WalletDao } from "../billing/wallet-dao";

const billing = new Hono<AppEnv>();

// ─── GET /balance ────────────────────────────────────────
billing.get("/balance", async (c) => {
	const ownerId = c.get("owner_id");
	const balance = await new WalletDao(c.env.DB).getBalance(ownerId);
	return c.json({ balance });
});

// ─── POST /checkout ──────────────────────────────────────
billing.post("/checkout", async (c) => {
	if (!c.env.STRIPE_SECRET_KEY) {
		return c.json(
			{ error: { message: "Billing not configured", type: "server_error" } },
			503,
		);
	}

	const { amount } = await c.req.json<{ amount: number }>();
	if (!amount || !Number.isInteger(amount) || amount < 100) {
		throw new BadRequestError("Amount must be at least 100 cents ($1)");
	}

	const ownerId = c.get("owner_id");
	const wallets = new WalletDao(c.env.DB);
	const origin = new URL(c.req.url).origin;

	let wallet = await wallets.get(ownerId);
	if (!wallet?.stripe_customer_id) {
		const customerId = await createCustomer(c.env.STRIPE_SECRET_KEY, ownerId);
		await wallets.ensureStripeCustomer(ownerId, customerId);
		wallet = await wallets.get(ownerId);
	}

	const { url, sessionId } = await createCheckoutSession({
		secretKey: c.env.STRIPE_SECRET_KEY,
		customerId: wallet?.stripe_customer_id as string,
		ownerId,
		amountCents: amount,
		successUrl: `${origin}/dashboard/billing?success=true`,
		cancelUrl: `${origin}/dashboard/billing?canceled=true`,
	});

	await new PaymentsDao(c.env.DB).create({
		owner_id: ownerId,
		type: "manual",
		stripe_session_id: sessionId,
		amount_cents: amount,
		credits: centsToCredits(amount),
		status: "pending",
	});

	return c.json({ url });
});

// ─── GET /history ────────────────────────────────────────
billing.get("/history", async (c) => {
	const ownerId = c.get("owner_id");
	const history = await new PaymentsDao(c.env.DB).getHistory(ownerId);
	return c.json({ data: history });
});

// ─── POST /cancel-pending ────────────────────────────────
billing.post("/cancel-pending", async (c) => {
	const ownerId = c.get("owner_id");
	const canceled = await new PaymentsDao(c.env.DB).cancelUserPending(ownerId);
	return c.json({ ok: true, canceled });
});

// ─── Auto Top-Up Config ─────────────────────────────────
billing.get("/auto-topup", async (c) => {
	const config = await new AutoTopUpDao(c.env.DB).getConfig(c.get("owner_id"));
	if (!config) return c.json({ enabled: false, hasCard: false });
	return c.json({
		enabled: !!config.enabled,
		threshold: config.threshold,
		amountCents: config.amount_cents,
		hasCard: !!config.payment_method_id,
		consecutiveFailures: config.consecutive_failures,
		pausedReason: config.paused_reason,
	});
});

billing.put("/auto-topup", async (c) => {
	const ownerId = c.get("owner_id");
	const body = await c.req.json<{
		enabled: boolean;
		threshold?: number;
		amountCents?: number;
	}>();

	if (body.enabled) {
		const config = await new AutoTopUpDao(c.env.DB).getConfig(ownerId);
		if (!config?.payment_method_id) {
			throw new BadRequestError(
				"No saved payment method. Complete a payment first.",
			);
		}
		if (body.threshold !== undefined && body.threshold < 1) {
			throw new BadRequestError("Threshold must be at least $1");
		}
		if (body.amountCents !== undefined && body.amountCents < 500) {
			throw new BadRequestError("Top-up amount must be at least $5");
		}
	}

	await new AutoTopUpDao(c.env.DB).upsertConfig(ownerId, {
		enabled: body.enabled ? 1 : 0,
		threshold: body.threshold,
		amount_cents: body.amountCents,
	});

	return c.json({ ok: true });
});

export default billing;

// ─── Stripe Webhook (separate, no auth middleware) ───────
export const webhookRouter = new Hono<AppEnv>();

webhookRouter.post("/stripe", async (c) => {
	const secret = c.env.STRIPE_WEBHOOK_SECRET;
	if (!secret) return c.text("Webhook not configured", 500);

	const payload = await c.req.text();
	const sig = c.req.header("stripe-signature") ?? "";

	const valid = await verifyWebhookSignature(payload, sig, secret);
	if (!valid) return c.text("Invalid signature", 400);

	const event = JSON.parse(payload) as StripeCheckoutEvent;
	const session = event.data.object;
	const paymentsDao = new PaymentsDao(c.env.DB);

	if (event.type === "checkout.session.expired") {
		await paymentsDao.transition(session.id, "expired");
		return c.json({ received: true, expired: true });
	}

	if (event.type !== "checkout.session.completed")
		return c.json({ received: true });
	if (session.payment_status !== "paid") return c.json({ received: true });

	const { owner_id, credits: creditsStr } = session.metadata;
	const credits = Number.parseFloat(creditsStr);
	if (!owner_id || !credits || credits <= 0)
		return c.text("Invalid metadata", 400);

	if (await paymentsDao.isFinal(session.id)) {
		return c.json({ received: true, duplicate: true });
	}

	if (await paymentsDao.transition(session.id, "completed")) {
		await new WalletDao(c.env.DB).credit(owner_id, credits);

		// Extract and save payment method for future auto top-up
		if (c.env.STRIPE_SECRET_KEY && session.payment_intent) {
			try {
				const pi = await getPaymentIntent(
					c.env.STRIPE_SECRET_KEY,
					session.payment_intent,
				);
				if (pi.payment_method) {
					await new AutoTopUpDao(c.env.DB).savePaymentMethod(
						owner_id,
						pi.payment_method,
					);
				}
			} catch (err) {
				log.warn(
					"webhook",
					`Failed to extract PM: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}

		return c.json({ received: true, credited: credits });
	}

	return c.json({ received: true, skipped: true });
});

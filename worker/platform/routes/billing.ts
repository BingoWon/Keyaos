import { Hono } from "hono";
import { BadRequestError } from "../../shared/errors";
import type { AppEnv } from "../../shared/types";
import { PaymentsDao } from "../billing/payments-dao";
import {
	centsToCredits,
	createCheckoutSession,
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

	const origin = new URL(c.req.url).origin;
	const ownerId = c.get("owner_id");

	const { url, sessionId } = await createCheckoutSession({
		secretKey: c.env.STRIPE_SECRET_KEY,
		ownerId,
		amountCents: amount,
		successUrl: `${origin}/dashboard/billing?success=true`,
		cancelUrl: `${origin}/dashboard/billing?canceled=true`,
	});

	await new PaymentsDao(c.env.DB).create({
		owner_id: ownerId,
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
		return c.json({ received: true, credited: credits });
	}

	return c.json({ received: true, skipped: true });
});

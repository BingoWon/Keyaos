/**
 * Stripe integration via raw fetch — zero external dependencies.
 *
 * Capabilities:
 *   1. Create a Checkout Session (with setup_future_usage for card-saving)
 *   2. Verify webhook signature + parse event
 *   3. Create/retrieve Stripe Customers
 *   4. Off-session PaymentIntents (auto top-up)
 */

const STRIPE_API = "https://api.stripe.com/v1";

function stripeHeaders(secretKey: string) {
	return {
		Authorization: `Basic ${btoa(`${secretKey}:`)}`,
		"Content-Type": "application/x-www-form-urlencoded",
	};
}

/** $1 USD = $1 Credits (1:1) */
export function centsToCredits(cents: number): number {
	return cents / 100;
}

export async function createCustomer(
	secretKey: string,
	ownerId: string,
): Promise<string> {
	const res = await fetch(`${STRIPE_API}/customers`, {
		method: "POST",
		headers: stripeHeaders(secretKey),
		body: new URLSearchParams({ "metadata[owner_id]": ownerId }),
	});
	if (!res.ok) throw new Error(`Stripe Customer error: ${res.status}`);
	const customer = (await res.json()) as { id: string };
	return customer.id;
}

export async function createCheckoutSession(opts: {
	secretKey: string;
	customerId: string;
	ownerId: string;
	amountCents: number;
	successUrl: string;
	cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
	const body = new URLSearchParams({
		mode: "payment",
		customer: opts.customerId,
		"payment_intent_data[setup_future_usage]": "off_session",
		"line_items[0][price_data][currency]": "usd",
		"line_items[0][price_data][product_data][name]": "Keyaos Credits",
		"line_items[0][price_data][unit_amount]": String(opts.amountCents),
		"line_items[0][quantity]": "1",
		expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
		success_url: opts.successUrl,
		cancel_url: opts.cancelUrl,
		"metadata[owner_id]": opts.ownerId,
		"metadata[credits]": String(centsToCredits(opts.amountCents)),
	});

	const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
		method: "POST",
		headers: stripeHeaders(opts.secretKey),
		body,
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Stripe Checkout error: ${res.status} ${err}`);
	}

	const session = (await res.json()) as { id: string; url: string };
	return { url: session.url, sessionId: session.id };
}

export async function getPaymentIntent(
	secretKey: string,
	piId: string,
): Promise<{ id: string; payment_method: string | null }> {
	const res = await fetch(`${STRIPE_API}/payment_intents/${piId}`, {
		headers: stripeHeaders(secretKey),
	});
	if (!res.ok) throw new Error(`Stripe PI fetch error: ${res.status}`);
	return (await res.json()) as { id: string; payment_method: string | null };
}

export async function createOffSessionPayment(opts: {
	secretKey: string;
	customerId: string;
	paymentMethodId: string;
	amountCents: number;
	ownerId: string;
}): Promise<{ id: string; status: string }> {
	const res = await fetch(`${STRIPE_API}/payment_intents`, {
		method: "POST",
		headers: stripeHeaders(opts.secretKey),
		body: new URLSearchParams({
			amount: String(opts.amountCents),
			currency: "usd",
			customer: opts.customerId,
			payment_method: opts.paymentMethodId,
			off_session: "true",
			confirm: "true",
			"metadata[owner_id]": opts.ownerId,
			"metadata[type]": "auto_topup",
			"metadata[credits]": String(centsToCredits(opts.amountCents)),
		}),
	});
	const pi = (await res.json()) as {
		id: string;
		status: string;
		error?: unknown;
	};
	if (!res.ok && !pi.status) {
		throw new Error(`Stripe off-session error: ${res.status}`);
	}
	return { id: pi.id, status: pi.status };
}

// Webhook signature verification using Web Crypto API (CF Workers native)
export async function verifyWebhookSignature(
	payload: string,
	sigHeader: string,
	secret: string,
): Promise<boolean> {
	let timestamp = "";
	const signatures: string[] = [];
	for (const part of sigHeader.split(",")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const k = part.slice(0, eq);
		const v = part.slice(eq + 1);
		if (k === "t") timestamp = v;
		else if (k === "v1") signatures.push(v);
	}

	if (!timestamp || signatures.length === 0) return false;

	const tolerance = 300;
	if (Math.abs(Date.now() / 1000 - Number(timestamp)) > tolerance) return false;

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signed = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${timestamp}.${payload}`),
	);

	const expected = [...new Uint8Array(signed)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	return signatures.includes(expected);
}

export interface StripeCheckoutEvent {
	type: string;
	data: {
		object: {
			id: string;
			payment_status: string;
			payment_intent: string;
			amount_total: number;
			metadata: { owner_id: string; credits: string };
		};
	};
}

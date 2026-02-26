/**
 * Stripe Checkout integration via raw fetch — zero external dependencies.
 *
 * Only two interactions:
 *   1. Create a Checkout Session (server-side redirect)
 *   2. Verify webhook signature + parse event
 */

const STRIPE_API = "https://api.stripe.com/v1";

/** $1 USD = $1 Credits (1:1) */
export function centsToCredits(cents: number): number {
	return cents / 100;
}

export async function createCheckoutSession(opts: {
	secretKey: string;
	ownerId: string;
	amountCents: number;
	successUrl: string;
	cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
	const body = new URLSearchParams({
		mode: "payment",
		"line_items[0][price_data][currency]": "usd",
		"line_items[0][price_data][product_data][name]": "Keyaos Credits",
		"line_items[0][price_data][unit_amount]": String(opts.amountCents),
		"line_items[0][quantity]": "1",
		success_url: opts.successUrl,
		cancel_url: opts.cancelUrl,
		"metadata[owner_id]": opts.ownerId,
		"metadata[credits]": String(centsToCredits(opts.amountCents)),
	});

	const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
		method: "POST",
		headers: {
			Authorization: `Basic ${btoa(`${opts.secretKey}:`)}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body,
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Stripe Checkout error: ${res.status} ${err}`);
	}

	const session = (await res.json()) as { id: string; url: string };
	return { url: session.url, sessionId: session.id };
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
			amount_total: number;
			metadata: { owner_id: string; credits: string };
		};
	};
}

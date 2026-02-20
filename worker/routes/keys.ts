import { Hono } from "hono";
import { KeysDao } from "../core/db/keys-dao";
import { getAllProviders, getProvider } from "../core/providers/registry";
import type { Env } from "../index";
import { ApiError, BadRequestError } from "../shared/errors";

/** Mask key for display: sk-or-v1-7a0•••7bd */
function maskKey(key: string): string {
	if (key.length <= 12) return "•".repeat(key.length);
	return `${key.slice(0, 10)}•••${key.slice(-3)}`;
}

const keysRouter = new Hono<{ Bindings: Env }>();

/** Convert native-currency amount to USD cents */
function toUsdCents(
	amount: number,
	currency: "USD" | "CNY",
	cnyRate: number,
): number {
	const usd = currency === "CNY" ? amount / cnyRate : amount;
	return Math.round(usd * 100);
}

keysRouter.post("/", async (c) => {
	let body: { provider: string; apiKey: string; credits?: number };
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	if (!body.provider || !body.apiKey) {
		throw new BadRequestError("provider and apiKey are required");
	}

	const provider = getProvider(body.provider);
	if (!provider) {
		const supported = getAllProviders()
			.map((p) => p.info.id)
			.join(", ");
		throw new BadRequestError(
			`Unknown provider: ${body.provider}. Supported: ${supported}`,
		);
	}

	const isValid = await provider.validateKey(body.apiKey);
	if (!isValid) {
		throw new BadRequestError(
			`Invalid API key for ${body.provider}. The key was rejected by the provider.`,
		);
	}

	// Check for duplicate key
	const keysDao = new KeysDao(c.env.DB);
	const existing = await keysDao.findByApiKey(body.apiKey);
	if (existing) {
		throw new BadRequestError("This API key has already been added.");
	}

	// ─── Determine credits ─────────────────────────────────
	let creditsCents = 0;
	let creditsSource: "auto" | "manual" = "manual";

	if (provider.info.supportsAutoCredits) {
		// Auto: fetch from upstream, ignore any manual input
		creditsSource = "auto";
		const cnyRate = parseFloat(c.env.CNY_USD_RATE || "7");
		const credits = await provider.fetchCredits(body.apiKey);
		if (credits?.remaining != null) {
			creditsCents = toUsdCents(
				credits.remaining,
				provider.info.currency,
				cnyRate,
			);
		}
	} else {
		// Manual: require user-provided credits
		if (body.credits == null || body.credits <= 0) {
			throw new BadRequestError(
				`${body.provider} does not support automatic credit detection. Please provide a "credits" value (in USD).`,
			);
		}
		creditsCents = Math.round(body.credits * 100);
	}

	const key = await keysDao.addKey({
		provider: body.provider,
		apiKey: body.apiKey,
		creditsCents,
		creditsSource,
	});

	return c.json(
		{
			id: key.id,
			provider: key.provider,
			keyHint: maskKey(key.api_key),
			credits: key.credits_cents / 100,
			creditsSource: key.credits_source,
			health: key.health_status,
			message: "Key added successfully",
		},
		201,
	);
});

keysRouter.get("/", async (c) => {
	const keysDao = new KeysDao(c.env.DB);
	const dbKeys = await keysDao.getAllKeys();
	return c.json({
		data: dbKeys.map((k) => ({
			id: k.id,
			provider: k.provider,
			keyHint: maskKey(k.api_key),
			credits: k.credits_cents / 100,
			creditsSource: k.credits_source,
			health: k.health_status,
			isActive: k.is_active === 1,
			addedAt: k.added_at,
		})),
	});
});

// Update credits — manual providers only
keysRouter.patch("/:id/credits", async (c) => {
	const id = c.req.param("id");
	const keysDao = new KeysDao(c.env.DB);
	const key = await keysDao.getKey(id);

	if (!key) {
		throw new ApiError("Key not found", 404, "not_found", "key_not_found");
	}

	if (key.credits_source === "auto") {
		throw new BadRequestError(
			"Cannot manually set credits for auto-credit providers. Credits are fetched automatically.",
		);
	}

	let body: { credits: number };
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	if (body.credits == null || body.credits < 0) {
		throw new BadRequestError("credits must be a non-negative number (USD)");
	}

	const creditsCents = Math.round(body.credits * 100);
	await keysDao.updateCredits(id, creditsCents, "manual");

	if (creditsCents > 0 && key.is_active === 0 && key.health_status !== "dead") {
		await c.env.DB.prepare("UPDATE key_pool SET is_active = 1 WHERE id = ?")
			.bind(id)
			.run();
	}

	return c.json({
		id,
		credits: creditsCents / 100,
		message: "Credits updated",
	});
});

keysRouter.delete("/:id", async (c) => {
	const keysDao = new KeysDao(c.env.DB);
	const success = await keysDao.deleteKey(c.req.param("id"));
	if (!success) {
		throw new ApiError("Key not found", 404, "not_found", "key_not_found");
	}
	return c.json({ message: "Key removed", id: c.req.param("id") });
});

// Refresh credits — for auto providers, re-fetches from upstream
keysRouter.get("/:id/credits", async (c) => {
	const id = c.req.param("id");
	const keysDao = new KeysDao(c.env.DB);
	const key = await keysDao.getKey(id);

	if (!key) {
		throw new ApiError("Key not found", 404, "not_found", "key_not_found");
	}

	const result: Record<string, unknown> = {
		id: key.id,
		provider: key.provider,
		credits: key.credits_cents / 100,
		creditsSource: key.credits_source,
	};

	// Auto providers: sync with upstream
	if (key.credits_source === "auto") {
		const provider = getProvider(key.provider);
		if (provider) {
			const cnyRate = parseFloat(c.env.CNY_USD_RATE || "7");
			const upstream = await provider.fetchCredits(key.api_key);
			if (upstream?.remaining != null) {
				const newCents = toUsdCents(
					upstream.remaining,
					provider.info.currency,
					cnyRate,
				);
				await keysDao.updateCredits(id, newCents, "auto");
				result.credits = newCents / 100;
				result.upstream = {
					remaining: upstream.remaining,
					usage: upstream.usage,
					currency: provider.info.currency,
				};
			}
		}
	}

	return c.json(result);
});

export default keysRouter;

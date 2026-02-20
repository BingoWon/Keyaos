import { Hono } from "hono";
import { KeysDao } from "../core/db/keys-dao";
import { getProvider, getProviderIds } from "../core/providers/registry";
import { decrypt, encrypt } from "../core/utils/crypto";
import type { Env } from "../index";
import { ApiError, BadRequestError } from "../shared/errors";

const keysRouter = new Hono<{ Bindings: Env }>();

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

	const providerIds = getProviderIds();
	if (!providerIds.includes(body.provider)) {
		throw new BadRequestError(
			`Unknown provider: ${body.provider}. Supported: ${providerIds.join(", ")}`,
		);
	}

	const provider = getProvider(body.provider);
	if (!provider) throw new BadRequestError("Provider not found");

	const isValid = await provider.validateKey(body.apiKey);
	if (!isValid) {
		throw new BadRequestError(
			`Invalid API key for ${body.provider}. The key was rejected by the provider.`,
		);
	}

	// ─── Determine credits ─────────────────────────────────
	let creditsCents = 0;
	let creditsSource: "auto" | "manual" = "manual";

	if (provider.info.supportsAutoCredits) {
		// Auto: fetch from upstream, reject manual input
		creditsSource = "auto";
		const credits = await provider.fetchCredits(body.apiKey);
		if (credits?.remainingUsd != null) {
			creditsCents = Math.round(credits.remainingUsd * 100);
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

	const encryptedKey = await encrypt(body.apiKey, c.env.ENCRYPTION_KEY);
	const keysDao = new KeysDao(c.env.DB);
	const key = await keysDao.addKey({
		ownerId: "owner",
		provider: body.provider,
		encryptedKey,
		creditsCents,
		creditsSource,
	});

	return c.json(
		{
			id: key.id,
			provider: key.provider,
			credits: key.credits_cents / 100,
			creditsSource: key.credits_source,
			health: key.health_status,
			createdAt: key.created_at,
			message: "Key added successfully",
		},
		201,
	);
});

/** Mask a key for display: show first prefix and last 4 chars */
function maskApiKey(encrypted: string): string {
	if (encrypted.length <= 16) return "••••••••";
	return `${encrypted.slice(0, 8)}••••••••${encrypted.slice(-4)}`;
}

keysRouter.get("/", async (c) => {
	const keysDao = new KeysDao(c.env.DB);
	const dbKeys = await keysDao.getAllKeys();
	return c.json({
		data: dbKeys.map((k) => ({
			id: k.id,
			provider: k.provider,
			maskedKey: maskApiKey(k.api_key_encrypted),
			credits: k.credits_cents / 100,
			creditsSource: k.credits_source,
			health: k.health_status,
			isActive: k.is_active === 1,
			createdAt: k.created_at,
		})),
	});
});

// Update credits (manual providers only)
keysRouter.patch("/:id/credits", async (c) => {
	const id = c.req.param("id");
	const keysDao = new KeysDao(c.env.DB);
	const key = await keysDao.getKey(id);

	if (!key) {
		throw new ApiError("Key not found", 404, "not_found", "key_not_found");
	}

	if (key.credits_source === "auto") {
		throw new BadRequestError(
			"Cannot manually set credits for auto-credit providers. Credits are fetched from the upstream API.",
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
	await keysDao.updateCredits(id, creditsCents);

	// Reactivate if credits > 0 and key was deactivated due to zero credits
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
	const id = c.req.param("id");
	const success = await keysDao.deleteKey(id);
	if (!success) {
		throw new ApiError("Key not found", 404, "not_found", "key_not_found");
	}
	return c.json({ message: "Key removed", id });
});

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

	// For auto providers, also fetch live data from upstream
	if (key.credits_source === "auto") {
		const provider = getProvider(key.provider);
		if (provider) {
			const rawKey = await decrypt(key.api_key_encrypted, c.env.ENCRYPTION_KEY);
			const upstream = await provider.fetchCredits(rawKey);
			if (upstream) {
				result.upstream = {
					remainingUsd: upstream.remainingUsd,
					usageUsd: upstream.usageUsd,
				};
				// Sync credits if upstream reports remaining
				if (upstream.remainingUsd != null) {
					const newCents = Math.round(upstream.remainingUsd * 100);
					await keysDao.updateCredits(id, newCents, "auto");
					result.credits = newCents / 100;
				}
			}
		}
	}

	return c.json(result);
});

export default keysRouter;

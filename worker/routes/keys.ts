import { Hono } from "hono";
import { KeysDao } from "../core/db/keys-dao";
import { getProvider, getProviderIds } from "../core/providers/registry";
import { decrypt, encrypt } from "../core/utils/crypto";
import type { Env } from "../index";
import { ApiError, BadRequestError } from "../shared/errors";

const keysRouter = new Hono<{ Bindings: Env }>();

keysRouter.post("/", async (c) => {
	let body: { provider: string; apiKey: string };
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

	// Encrypt before storage
	const encryptedKey = await encrypt(body.apiKey, c.env.ENCRYPTION_KEY);

	const keysDao = new KeysDao(c.env.DB);
	const key = await keysDao.addKey("owner", body.provider, encryptedKey);

	return c.json(
		{
			id: key.id,
			provider: key.provider,
			health: key.health_status,
			createdAt: key.created_at,
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
			health: k.health_status,
			isActive: k.is_active === 1,
			priceRatio: k.price_ratio,
			createdAt: k.created_at,
		})),
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

keysRouter.get("/:id/balance", async (c) => {
	const id = c.req.param("id");
	const keysDao = new KeysDao(c.env.DB);
	const key = await keysDao.getKey(id);

	if (!key) {
		throw new ApiError("Key not found", 404, "not_found", "key_not_found");
	}

	const provider = getProvider(key.provider);
	if (!provider) {
		throw new ApiError("Provider not found", 500);
	}

	// Decrypt key before checking balance with upstream
	const rawKey = await decrypt(key.api_key_encrypted, c.env.ENCRYPTION_KEY);
	const balance = await provider.checkBalance(rawKey);
	return c.json({ id: key.id, provider: key.provider, balance });
});

export default keysRouter;

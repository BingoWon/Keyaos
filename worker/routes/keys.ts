import { Hono } from "hono";
import { Config } from "../core/config";
import { KeysDao } from "../core/db/keys-dao";
import { KeyPoolService } from "../core/key-pool";
import { getProvider, getProviderIds } from "../core/providers/registry";
import type { Env } from "../index";
import { ApiError, BadRequestError } from "../shared/errors";

const keysRouter = new Hono<{ Bindings: Env }>();

keysRouter.post("/", async (c) => {
	const keyPool = new KeyPoolService(c.env.DB);
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

	const key = await keyPool.addKey(
		Config.ADMIN_MOCK_USER_ID,
		body.provider,
		body.apiKey,
	);

	return c.json(
		{
			id: key.id,
			provider: key.provider,
			health: key.health_status,
			isActive: key.is_active === 1,
			createdAt: key.created_at,
			message: "Key added successfully",
		},
		201,
	);
});

keysRouter.get("/", async (c) => {
	const keyPool = new KeyPoolService(c.env.DB);
	const dbKeys = await keyPool.getAllKeys();
	const keys = dbKeys.map((k) => ({
		id: k.id,
		provider: k.provider,
		health: k.health_status,
		isActive: k.is_active === 1,
		priceRatio: k.price_ratio,
		createdAt: k.created_at,
	}));
	return c.json({ data: keys });
});

keysRouter.delete("/:id", async (c) => {
	const keyPool = new KeyPoolService(c.env.DB);
	const id = c.req.param("id");
	const success = await keyPool.removeKey(id);
	if (!success) {
		throw new ApiError("Key not found", 404, "not_found", "key_not_found");
	}
	return c.json({ message: "Key removed", id });
});

keysRouter.get("/:id/balance", async (c) => {
	const id = c.req.param("id");
	const dao = new KeysDao(c.env.DB);
	const key = await dao.getKey(id);

	if (!key) {
		throw new ApiError("Key not found", 404, "not_found", "key_not_found");
	}

	const provider = getProvider(key.provider);
	if (!provider) {
		throw new ApiError("Provider not found", 500);
	}

	const balance = await provider.checkBalance(key.api_key_encrypted);
	return c.json({ id: key.id, provider: key.provider, balance });
});

export default keysRouter;

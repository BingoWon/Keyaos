import { Hono } from "hono";
import { z } from "zod";
import { UpstreamKeysDao } from "../core/db/upstream-keys-dao";
import { getAllProviders, getProvider } from "../core/providers/registry";
import { ApiError, BadRequestError } from "../shared/errors";
import type { AppEnv } from "../shared/types";
import { parse } from "../shared/validate";

function maskKey(key: string): string {
	if (key.length <= 12) return "•".repeat(key.length);
	return `${key.slice(0, 10)}•••${key.slice(-3)}`;
}

function toQuota(
	amount: number,
	currency: "USD" | "CNY",
	cnyRate: number,
): number {
	return currency === "CNY" ? amount / cnyRate : amount;
}

const AddKeyBody = z.object({
	provider: z.string().min(1, "provider is required"),
	apiKey: z.string().min(1, "apiKey is required"),
	quota: z.number().positive().optional(),
	isEnabled: z.number().int().min(0).max(1).optional(),
	priceMultiplier: z.number().positive().optional(),
});

const UpdateQuotaBody = z.object({
	quota: z.number().min(0, "quota must be a non-negative number"),
});

const UpdateSettingsBody = z.object({
	isEnabled: z.number().int().min(0).max(1).optional(),
	priceMultiplier: z.number().positive().optional(),
});

const upstreamKeysRouter = new Hono<AppEnv>();

upstreamKeysRouter.post("/", async (c) => {
	const body = parse(
		AddKeyBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body");
		}),
	);

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

	const dao = new UpstreamKeysDao(c.env.DB);
	const existing = await dao.findByApiKey(body.apiKey);
	if (existing) {
		throw new BadRequestError("This API key has already been added.");
	}

	let quota = 0;
	let quotaSource: "auto" | "manual" = "manual";

	if (provider.info.supportsAutoCredits) {
		quotaSource = "auto";
		const cnyRate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
		const upstream = await provider.fetchCredits(body.apiKey);
		if (upstream?.remaining != null) {
			quota = toQuota(upstream.remaining, provider.info.currency, cnyRate);
		}
	} else {
		if (body.quota == null || body.quota <= 0) {
			throw new BadRequestError(
				`${body.provider} does not support automatic detection. Please provide a "quota" value.`,
			);
		}
		quota = body.quota;
	}

	const upstreamKey = await dao.add({
		owner_id: c.get("owner_id"),
		provider: body.provider,
		apiKey: body.apiKey,
		quota,
		quotaSource,
		isEnabled: body.isEnabled,
		priceMultiplier: body.priceMultiplier,
	});

	return c.json(
		{
			id: upstreamKey.id,
			provider: upstreamKey.provider,
			keyHint: maskKey(upstreamKey.api_key),
			quota: upstreamKey.quota,
			quotaSource: upstreamKey.quota_source,
			health: upstreamKey.health_status,
			message: "Upstream key added",
		},
		201,
	);
});

upstreamKeysRouter.get("/", async (c) => {
	const dao = new UpstreamKeysDao(c.env.DB);
	const all = await dao.getAll(c.get("owner_id"));
	return c.json({
		data: all.map((k) => ({
			id: k.id,
			provider: k.provider,
			keyHint: maskKey(k.api_key),
			quota: k.quota,
			quotaSource: k.quota_source,
			health: k.health_status,
			isEnabled: k.is_enabled === 1,
			priceMultiplier: k.price_multiplier,
			addedAt: k.added_at,
		})),
	});
});

upstreamKeysRouter.patch("/:id/quota", async (c) => {
	const id = c.req.param("id");
	const dao = new UpstreamKeysDao(c.env.DB);
	const owner_id = c.get("owner_id");
	const upstreamKey = await dao.get(id, owner_id);

	if (!upstreamKey) {
		throw new ApiError(
			"Upstream key not found",
			404,
			"not_found",
			"upstream_key_not_found",
		);
	}

	if (upstreamKey.quota_source === "auto") {
		throw new BadRequestError(
			"Cannot manually set quota for auto-detected providers. System fetches them automatically.",
		);
	}

	const body = parse(
		UpdateQuotaBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body");
		}),
	);

	await dao.updateQuota(id, body.quota, "manual");

	if (
		body.quota > 0 &&
		upstreamKey.is_enabled === 0 &&
		upstreamKey.health_status !== "dead"
	) {
		await dao.updateSettings(id, 1, upstreamKey.price_multiplier);
	}

	return c.json({ id, quota: body.quota, message: "Quota updated" });
});

upstreamKeysRouter.delete("/:id", async (c) => {
	const dao = new UpstreamKeysDao(c.env.DB);
	const success = await dao.remove(c.req.param("id"), c.get("owner_id"));
	if (!success) {
		throw new ApiError(
			"Upstream key not found",
			404,
			"not_found",
			"upstream_key_not_found",
		);
	}
	return c.json({ message: "Upstream key removed", id: c.req.param("id") });
});

upstreamKeysRouter.patch("/:id/settings", async (c) => {
	const id = c.req.param("id");
	const body = parse(
		UpdateSettingsBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body");
		}),
	);

	const dao = new UpstreamKeysDao(c.env.DB);
	const upstreamKey = await dao.get(id, c.get("owner_id"));
	if (!upstreamKey) {
		throw new ApiError(
			"Upstream key not found",
			404,
			"not_found",
			"upstream_key_not_found",
		);
	}

	const isEnabled = body.isEnabled ?? upstreamKey.is_enabled;
	const priceMultiplier = body.priceMultiplier ?? upstreamKey.price_multiplier;

	await dao.updateSettings(id, isEnabled, priceMultiplier);

	return c.json({
		message: "Settings updated",
		id,
		isEnabled,
		priceMultiplier,
	});
});

upstreamKeysRouter.get("/:id/quota", async (c) => {
	const id = c.req.param("id");
	const dao = new UpstreamKeysDao(c.env.DB);
	const upstreamKey = await dao.get(id, c.get("owner_id"));

	if (!upstreamKey) {
		throw new ApiError(
			"Upstream key not found",
			404,
			"not_found",
			"upstream_key_not_found",
		);
	}

	const result: Record<string, unknown> = {
		id: upstreamKey.id,
		provider: upstreamKey.provider,
		quota: upstreamKey.quota,
		quotaSource: upstreamKey.quota_source,
	};

	if (upstreamKey.quota_source === "auto") {
		const provider = getProvider(upstreamKey.provider);
		if (provider) {
			const cnyRate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
			const upstream = await provider.fetchCredits(upstreamKey.api_key);
			if (upstream?.remaining != null) {
				const newQuota = toQuota(
					upstream.remaining,
					provider.info.currency,
					cnyRate,
				);
				await dao.updateQuota(id, newQuota, "auto");
				result.quota = newQuota;
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

export default upstreamKeysRouter;

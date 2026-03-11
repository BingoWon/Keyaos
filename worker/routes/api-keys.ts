import { Hono } from "hono";
import { z } from "zod";
import { ApiKeysDao } from "../core/db/api-keys-dao";
import type { DbApiKey } from "../core/db/schema";
import { ApiError, BadRequestError } from "../shared/errors";
import type { AppEnv } from "../shared/types";
import { parse } from "../shared/validate";

const CreateKeyBody = z.object({
	name: z
		.string()
		.optional()
		.transform((v) => (v?.trim() ? v.trim() : "Untitled Key")),
	expiresAt: z.number().int().positive().nullable().optional(),
	quotaLimit: z.number().positive().nullable().optional(),
	allowedModels: z.array(z.string().min(1)).nullable().optional(),
	allowedIps: z.array(z.string().min(1)).nullable().optional(),
});

const UpdateKeyBody = z.object({
	name: z.string().min(1).optional(),
	isEnabled: z.number().min(0).max(1).optional(),
	expiresAt: z.number().int().positive().nullable().optional(),
	quotaLimit: z.number().positive().nullable().optional(),
	allowedModels: z.array(z.string().min(1)).nullable().optional(),
	allowedIps: z.array(z.string().min(1)).nullable().optional(),
});

function formatKey(k: DbApiKey) {
	return {
		id: k.id,
		name: k.name,
		keyHint: k.key_hint,
		isEnabled: k.is_enabled === 1,
		expiresAt: k.expires_at,
		quotaLimit: k.quota_limit,
		quotaUsed: k.quota_used,
		allowedModels: k.allowed_models ? JSON.parse(k.allowed_models) : null,
		allowedIps: k.allowed_ips ? JSON.parse(k.allowed_ips) : null,
		createdAt: k.created_at,
	};
}

const apiKeysRouter = new Hono<AppEnv>();

apiKeysRouter.post("/", async (c) => {
	const body = parse(
		CreateKeyBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body", "invalid_json");
		}),
	);

	const dao = new ApiKeysDao(c.env.DB, c.env.ENCRYPTION_KEY);
	const { record, plainKey } = await dao.createKey(c.get("owner_id"), {
		name: body.name,
		expires_at: body.expiresAt ?? null,
		quota_limit: body.quotaLimit ?? null,
		allowed_models: body.allowedModels ?? null,
		allowed_ips: body.allowedIps ?? null,
	});

	return c.json(
		{
			data: {
				...formatKey(record),
				plainKey,
			},
		},
		201,
	);
});

apiKeysRouter.get("/", async (c) => {
	const dao = new ApiKeysDao(c.env.DB, c.env.ENCRYPTION_KEY);
	const keys = await dao.listKeys(c.get("owner_id"));
	return c.json({ data: keys.map(formatKey) });
});

apiKeysRouter.get("/:id/reveal", async (c) => {
	const dao = new ApiKeysDao(c.env.DB, c.env.ENCRYPTION_KEY);
	const key = await dao.revealKey(c.req.param("id"), c.get("owner_id"));
	if (!key) {
		throw new ApiError(
			"API Key not found",
			404,
			"not_found",
			"api_key_not_found",
		);
	}
	return c.json({ key });
});

apiKeysRouter.patch("/:id", async (c) => {
	const body = parse(
		UpdateKeyBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body", "invalid_json");
		}),
	);

	const dao = new ApiKeysDao(c.env.DB, c.env.ENCRYPTION_KEY);
	const success = await dao.updateKey(c.req.param("id"), c.get("owner_id"), {
		name: body.name,
		is_enabled: body.isEnabled,
		expires_at: body.expiresAt,
		quota_limit: body.quotaLimit,
		allowed_models: body.allowedModels,
		allowed_ips: body.allowedIps,
	});
	if (!success) {
		throw new ApiError(
			"API Key not found",
			404,
			"not_found",
			"api_key_not_found",
		);
	}
	return c.json({ message: "API Key updated" });
});

apiKeysRouter.post("/:id/reset-quota", async (c) => {
	const dao = new ApiKeysDao(c.env.DB, c.env.ENCRYPTION_KEY);
	const success = await dao.resetQuotaUsed(
		c.req.param("id"),
		c.get("owner_id"),
	);
	if (!success) {
		throw new ApiError(
			"API Key not found",
			404,
			"not_found",
			"api_key_not_found",
		);
	}
	return c.json({ message: "Quota usage reset" });
});

apiKeysRouter.delete("/:id", async (c) => {
	const dao = new ApiKeysDao(c.env.DB, c.env.ENCRYPTION_KEY);
	const success = await dao.deleteKey(c.req.param("id"), c.get("owner_id"));
	if (!success) {
		throw new ApiError(
			"API Key not found",
			404,
			"not_found",
			"api_key_not_found",
		);
	}
	return c.json({ message: "API Key removed", id: c.req.param("id") });
});

export default apiKeysRouter;

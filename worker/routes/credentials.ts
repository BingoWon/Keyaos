import { Hono } from "hono";
import { z } from "zod";
import { CredentialsDao } from "../core/db/credentials-dao";
import { LogsDao } from "../core/db/logs-dao";
import { getProvider } from "../core/providers/registry";
import { sha256 } from "../shared/crypto";
import { ApiError, BadRequestError } from "../shared/errors";
import type { AppEnv } from "../shared/types";
import { parse } from "../shared/validate";

function toQuota(
	amount: number,
	currency: "USD" | "CNY",
	cnyRate: number,
): number {
	return currency === "CNY" ? amount / cnyRate : amount;
}

const AddCredentialBody = z.object({
	provider_id: z.string().min(1, "provider_id is required"),
	secret: z.string().min(1, "secret is required"),
	quota: z.number().positive().optional(),
	isEnabled: z.number().int().min(0).max(1).optional(),
	priceMultiplier: z
		.number()
		.positive()
		.max(1, "price_multiplier must not exceed 1.0")
		.optional(),
});

const UpdateQuotaBody = z.object({
	quota: z.number().min(0, "quota must be a non-negative number"),
});

const UpdateSettingsBody = z.object({
	isEnabled: z.number().int().min(0).max(1).optional(),
	priceMultiplier: z
		.number()
		.positive()
		.max(1, "price_multiplier must not exceed 1.0")
		.optional(),
});

const credentialsRouter = new Hono<AppEnv>();

credentialsRouter.post("/", async (c) => {
	const body = parse(
		AddCredentialBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body", "invalid_json");
		}),
	);

	const provider = getProvider(body.provider_id);
	if (!provider) {
		throw new BadRequestError(
			`Unknown provider: ${body.provider_id}`,
			"unknown_provider",
		);
	}

	const isSub = provider.info.isSubscription ?? false;
	const needsManualQuota = !isSub && !provider.info.supportsAutoCredits;

	if (needsManualQuota && (body.quota == null || body.quota <= 0)) {
		throw new BadRequestError("Manual quota required", "quota_required");
	}

	let secret: string;
	try {
		secret = provider.normalizeSecret
			? provider.normalizeSecret(body.secret)
			: body.secret;
	} catch (err) {
		throw new BadRequestError(
			err instanceof Error ? err.message : "Invalid secret format",
			"invalid_secret_format",
		);
	}

	if (body.provider_id === "keyaos") {
		const keyHash = await sha256(secret);
		const ownKey = await c.env.DB.prepare(
			"SELECT 1 FROM api_keys WHERE key_hash = ? AND owner_id = ? LIMIT 1",
		)
			.bind(keyHash, c.get("owner_id"))
			.first();
		if (ownKey) {
			throw new BadRequestError(
				"Self-credential cycle detected",
				"self_credential_cycle",
			);
		}
	}

	const isValid = await provider.validateKey(secret);
	if (!isValid) {
		throw new BadRequestError(
			"Credential rejected by provider",
			"invalid_credential",
		);
	}

	const dao = new CredentialsDao(c.env.DB, c.env.ENCRYPTION_KEY);
	if (await dao.existsBySecretHash(secret)) {
		throw new BadRequestError("Duplicate credential", "credential_duplicate");
	}

	const authType = provider.info.authType ?? "api_key";
	let quota: number | null = null;
	let quotaSource: "auto" | "manual" | null = null;

	if (isSub) {
		// Subscription-based provider — no quota tracking
	} else if (provider.info.supportsAutoCredits) {
		quotaSource = "auto";
		const cnyRate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
		const upstream = await provider.fetchCredits(secret);
		if (upstream?.remaining != null) {
			quota = toQuota(upstream.remaining, provider.info.currency, cnyRate);
		}
	} else {
		quota = body.quota ?? null;
		quotaSource = "manual";
	}

	const credential = await dao.add({
		owner_id: c.get("owner_id"),
		provider_id: body.provider_id,
		authType,
		secret,
		quota,
		quotaSource,
		isEnabled: body.isEnabled,
		priceMultiplier: body.priceMultiplier,
	});

	return c.json(
		{
			id: credential.id,
			provider_id: credential.provider_id,
			secretHint: credential.secret_hint,
			quota: credential.quota,
			quotaSource: credential.quota_source,
			health: credential.health_status,
			message: "Credential added",
		},
		201,
	);
});

credentialsRouter.get("/", async (c) => {
	const ownerId = c.get("owner_id");
	const [all, earnings] = await Promise.all([
		new CredentialsDao(c.env.DB, c.env.ENCRYPTION_KEY).getAll(ownerId),
		new LogsDao(c.env.DB).getEarningsByCredential(ownerId),
	]);
	return c.json({
		data: all.map((cred) => ({
			id: cred.id,
			provider_id: cred.provider_id,
			authType: cred.auth_type,
			secretHint: cred.secret_hint,
			quota: cred.quota,
			quotaSource: cred.quota_source,
			health: cred.health_status,
			isEnabled: cred.is_enabled === 1,
			priceMultiplier: cred.price_multiplier,
			addedAt: cred.added_at,
			earnings: earnings.get(cred.id) ?? 0,
		})),
	});
});

credentialsRouter.patch("/:id/quota", async (c) => {
	const id = c.req.param("id");
	const dao = new CredentialsDao(c.env.DB, c.env.ENCRYPTION_KEY);
	const owner_id = c.get("owner_id");
	const credential = await dao.get(id, owner_id);

	if (!credential) {
		throw new ApiError(
			"Credential not found",
			404,
			"not_found",
			"credential_not_found",
		);
	}

	if (credential.quota_source === "auto") {
		throw new BadRequestError(
			"Quota is auto-detected for this provider",
			"quota_auto_only",
		);
	}

	const provider = getProvider(credential.provider_id);
	if (provider?.info.isSubscription) {
		throw new BadRequestError(
			"Subscription providers have no quota",
			"quota_subscription",
		);
	}

	const body = parse(
		UpdateQuotaBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body", "invalid_json");
		}),
	);

	await dao.updateQuota(id, body.quota, "manual");

	if (
		body.quota > 0 &&
		credential.is_enabled === 0 &&
		credential.health_status !== "dead"
	) {
		await dao.updateSettings(id, 1, credential.price_multiplier);
	}

	return c.json({ id, quota: body.quota, message: "Quota updated" });
});

credentialsRouter.delete("/:id", async (c) => {
	const dao = new CredentialsDao(c.env.DB, c.env.ENCRYPTION_KEY);
	const success = await dao.remove(c.req.param("id"), c.get("owner_id"));
	if (!success) {
		throw new ApiError(
			"Credential not found",
			404,
			"not_found",
			"credential_not_found",
		);
	}
	return c.json({ message: "Credential removed", id: c.req.param("id") });
});

credentialsRouter.patch("/:id/settings", async (c) => {
	const id = c.req.param("id");
	const body = parse(
		UpdateSettingsBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body", "invalid_json");
		}),
	);

	const dao = new CredentialsDao(c.env.DB, c.env.ENCRYPTION_KEY);
	const credential = await dao.get(id, c.get("owner_id"));
	if (!credential) {
		throw new ApiError("Not found", 404, "not_found", "credential_not_found");
	}

	const isEnabled = body.isEnabled ?? credential.is_enabled;
	const priceMultiplier = body.priceMultiplier ?? credential.price_multiplier;

	await dao.updateSettings(id, isEnabled, priceMultiplier);

	return c.json({
		message: "Settings updated",
		id,
		isEnabled,
		priceMultiplier,
	});
});

credentialsRouter.get("/:id/quota", async (c) => {
	const id = c.req.param("id");
	const dao = new CredentialsDao(c.env.DB, c.env.ENCRYPTION_KEY);
	const credential = await dao.get(id, c.get("owner_id"));

	if (!credential) {
		throw new ApiError(
			"Credential not found",
			404,
			"not_found",
			"credential_not_found",
		);
	}

	const result: Record<string, unknown> = {
		id: credential.id,
		provider_id: credential.provider_id,
		quota: credential.quota,
		quotaSource: credential.quota_source,
	};

	if (credential.quota_source === "auto") {
		const provider = getProvider(credential.provider_id);
		if (provider) {
			const secret = await dao.decryptSecret(credential);
			const cnyRate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
			const upstream = await provider.fetchCredits(secret);
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

export default credentialsRouter;

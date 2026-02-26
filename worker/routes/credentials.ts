import { Hono } from "hono";
import { z } from "zod";
import { CredentialsDao } from "../core/db/credentials-dao";
import { UsageDao } from "../core/db/usage-dao";
import { getAllProviders, getProvider } from "../core/providers/registry";
import { ApiError, BadRequestError } from "../shared/errors";
import type { AppEnv } from "../shared/types";
import { parse } from "../shared/validate";

function maskSecret(secret: string): string {
	if (secret.length <= 12) return "•".repeat(secret.length);
	return `${secret.slice(0, 10)}•••${secret.slice(-3)}`;
}

function toQuota(
	amount: number,
	currency: "USD" | "CNY",
	cnyRate: number,
): number {
	return currency === "CNY" ? amount / cnyRate : amount;
}

const AddCredentialBody = z.object({
	provider: z.string().min(1, "provider is required"),
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

	const isSub = provider.info.isSubscription ?? false;
	const needsManualQuota = !isSub && !provider.info.supportsAutoCredits;

	if (needsManualQuota && (body.quota == null || body.quota <= 0)) {
		throw new BadRequestError(
			`${body.provider} does not support automatic quota detection. Please provide a "quota" value.`,
		);
	}

	let secret: string;
	try {
		secret = provider.normalizeSecret
			? provider.normalizeSecret(body.secret)
			: body.secret;
	} catch (err) {
		throw new BadRequestError(
			err instanceof Error ? err.message : "Invalid secret format",
		);
	}

	const isValid = await provider.validateKey(secret);
	if (!isValid) {
		throw new BadRequestError(
			`Invalid credential for ${body.provider}. The secret was rejected by the provider.`,
		);
	}

	const dao = new CredentialsDao(c.env.DB);
	const existing = await dao.findBySecret(secret);
	if (existing) {
		throw new BadRequestError("This credential has already been added.");
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
		provider: body.provider,
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
			provider: credential.provider,
			secretHint: maskSecret(credential.secret),
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
		new CredentialsDao(c.env.DB).getAll(ownerId),
		new UsageDao(c.env.DB).getEarningsByCredential(ownerId),
	]);
	return c.json({
		data: all.map((cred) => ({
			id: cred.id,
			provider: cred.provider,
			authType: cred.auth_type,
			secretHint: maskSecret(cred.secret),
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
	const dao = new CredentialsDao(c.env.DB);
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
			"Cannot manually set quota for auto-detected providers. System fetches them automatically.",
		);
	}

	const provider = getProvider(credential.provider);
	if (provider?.info.isSubscription) {
		throw new BadRequestError(
			"Subscription-based providers do not use quota tracking.",
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
		credential.is_enabled === 0 &&
		credential.health_status !== "dead"
	) {
		await dao.updateSettings(id, 1, credential.price_multiplier);
	}

	return c.json({ id, quota: body.quota, message: "Quota updated" });
});

credentialsRouter.delete("/:id", async (c) => {
	const dao = new CredentialsDao(c.env.DB);
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
			throw new BadRequestError("Invalid JSON body");
		}),
	);

	const dao = new CredentialsDao(c.env.DB);
	const credential = await dao.get(id, c.get("owner_id"));
	if (!credential) {
		throw new ApiError(
			"Credential not found",
			404,
			"not_found",
			"credential_not_found",
		);
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
	const dao = new CredentialsDao(c.env.DB);
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
		provider: credential.provider,
		quota: credential.quota,
		quotaSource: credential.quota_source,
	};

	if (credential.quota_source === "auto") {
		const provider = getProvider(credential.provider);
		if (provider) {
			const cnyRate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
			const upstream = await provider.fetchCredits(credential.secret);
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

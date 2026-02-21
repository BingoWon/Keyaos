import { Hono } from "hono";
import { z } from "zod";
import { QuotasDao } from "../core/db/quotas-dao";
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

const AddQuotaBody = z.object({
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

const quotasRouter = new Hono<AppEnv>();

quotasRouter.post("/", async (c) => {
	const body = parse(
		AddQuotaBody,
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

	const quotasDao = new QuotasDao(c.env.DB);
	const existing = await quotasDao.findByApiKey(body.apiKey);
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

	const listing = await quotasDao.addListing({
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
			id: listing.id,
			provider: listing.provider,
			keyHint: maskKey(listing.api_key),
			quota: listing.quota,
			quotaSource: listing.quota_source,
			health: listing.health_status,
			message: "Quota Listing added successfully",
		},
		201,
	);
});

quotasRouter.get("/", async (c) => {
	const quotasDao = new QuotasDao(c.env.DB);
	const all = await quotasDao.getAllListings(c.get("owner_id"));
	return c.json({
		data: all.map((l) => ({
			id: l.id,
			provider: l.provider,
			keyHint: maskKey(l.api_key),
			quota: l.quota,
			quotaSource: l.quota_source,
			health: l.health_status,
			isEnabled: l.is_enabled === 1,
			priceMultiplier: l.price_multiplier,
			addedAt: l.added_at,
		})),
	});
});

quotasRouter.patch("/:id/quota", async (c) => {
	const id = c.req.param("id");
	const quotasDao = new QuotasDao(c.env.DB);
	const owner_id = c.get("owner_id");
	const listing = await quotasDao.getListing(id, owner_id);

	if (!listing) {
		throw new ApiError(
			"Quota listing not found",
			404,
			"not_found",
			"listing_not_found",
		);
	}

	if (listing.quota_source === "auto") {
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

	await quotasDao.updateQuota(id, body.quota, "manual");

	if (
		body.quota > 0 &&
		listing.is_enabled === 0 &&
		listing.health_status !== "dead"
	) {
		await quotasDao.updateSettings(id, 1, listing.price_multiplier);
	}

	return c.json({ id, quota: body.quota, message: "Quota updated" });
});

quotasRouter.delete("/:id", async (c) => {
	const quotasDao = new QuotasDao(c.env.DB);
	const success = await quotasDao.deleteListing(
		c.req.param("id"),
		c.get("owner_id"),
	);
	if (!success) {
		throw new ApiError(
			"Quota listing not found",
			404,
			"not_found",
			"listing_not_found",
		);
	}
	return c.json({ message: "Quota listing removed", id: c.req.param("id") });
});

quotasRouter.patch("/:id/settings", async (c) => {
	const id = c.req.param("id");
	const body = parse(
		UpdateSettingsBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body");
		}),
	);

	const quotasDao = new QuotasDao(c.env.DB);
	const listing = await quotasDao.getListing(id, c.get("owner_id"));
	if (!listing) {
		throw new ApiError(
			"Quota listing not found",
			404,
			"not_found",
			"listing_not_found",
		);
	}

	const isEnabled = body.isEnabled ?? listing.is_enabled;
	const priceMultiplier = body.priceMultiplier ?? listing.price_multiplier;

	await quotasDao.updateSettings(id, isEnabled, priceMultiplier);

	return c.json({
		message: "Settings updated",
		id,
		isEnabled,
		priceMultiplier,
	});
});

quotasRouter.get("/:id/quota", async (c) => {
	const id = c.req.param("id");
	const quotasDao = new QuotasDao(c.env.DB);
	const listing = await quotasDao.getListing(id, c.get("owner_id"));

	if (!listing) {
		throw new ApiError(
			"Quota listing not found",
			404,
			"not_found",
			"listing_not_found",
		);
	}

	const result: Record<string, unknown> = {
		id: listing.id,
		provider: listing.provider,
		quota: listing.quota,
		quotaSource: listing.quota_source,
	};

	if (listing.quota_source === "auto") {
		const provider = getProvider(listing.provider);
		if (provider) {
			const cnyRate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
			const upstream = await provider.fetchCredits(listing.api_key);
			if (upstream?.remaining != null) {
				const newQuota = toQuota(
					upstream.remaining,
					provider.info.currency,
					cnyRate,
				);
				await quotasDao.updateQuota(id, newQuota, "auto");
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

export default quotasRouter;

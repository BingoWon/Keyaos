import { Hono } from "hono";
import { ListingsDao } from "../core/db/listings-dao";
import { getAllProviders, getProvider } from "../core/providers/registry";
import type { Env } from "../index";
import { ApiError, BadRequestError } from "../shared/errors";

/** Mask key for display: sk-or-v1-7a0•••7bd */
function maskKey(key: string): string {
	if (key.length <= 12) return "•".repeat(key.length);
	return `${key.slice(0, 10)}•••${key.slice(-3)}`;
}

const listingsRouter = new Hono<{ Bindings: Env }>();

/** Convert native-currency amount to USD cents */
function toUsdCents(
	amount: number,
	currency: "USD" | "CNY",
	cnyRate: number,
): number {
	const usd = currency === "CNY" ? amount / cnyRate : amount;
	return Math.round(usd * 100);
}

listingsRouter.post("/", async (c) => {
	let body: {
		provider: string;
		apiKey: string;
		credits?: number;
		isEnabled?: number;
		priceMultiplier?: number;
	};
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

	// Check for duplicate API key
	const listingsDao = new ListingsDao(c.env.DB);
	const existing = await listingsDao.findByApiKey(body.apiKey);
	if (existing) {
		throw new BadRequestError("This API key has already been added.");
	}

	// ─── Determine credits ─────────────────────────────────
	let creditsCents = 0;
	let creditsSource: "auto" | "manual" = "manual";

	if (provider.info.supportsAutoCredits) {
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
		if (body.credits == null || body.credits <= 0) {
			throw new BadRequestError(
				`${body.provider} does not support automatic credit detection. Please provide a "credits" value (in USD).`,
			);
		}
		creditsCents = Math.round(body.credits * 100);
	}

	const listing = await listingsDao.addListing({
		provider: body.provider,
		apiKey: body.apiKey,
		creditsCents,
		creditsSource,
		isEnabled: body.isEnabled,
		priceMultiplier: body.priceMultiplier,
	});

	return c.json(
		{
			id: listing.id,
			provider: listing.provider,
			keyHint: maskKey(listing.api_key),
			credits: listing.credits_cents / 100,
			creditsSource: listing.credits_source,
			health: listing.health_status,
			message: "Credit Listing added successfully",
		},
		201,
	);
});

listingsRouter.get("/", async (c) => {
	const listingsDao = new ListingsDao(c.env.DB);
	const all = await listingsDao.getAllListings();
	return c.json({
		data: all.map((l) => ({
			id: l.id,
			provider: l.provider,
			keyHint: maskKey(l.api_key),
			credits: l.credits_cents / 100,
			creditsSource: l.credits_source,
			health: l.health_status,
			isEnabled: l.is_enabled === 1,
			priceMultiplier: l.price_multiplier,
			addedAt: l.added_at,
		})),
	});
});

listingsRouter.patch("/:id/credits", async (c) => {
	const id = c.req.param("id");
	const listingsDao = new ListingsDao(c.env.DB);
	const listing = await listingsDao.getListing(id);

	if (!listing) {
		throw new ApiError(
			"Credit listing not found",
			404,
			"not_found",
			"listing_not_found",
		);
	}

	if (listing.credits_source === "auto") {
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
	await listingsDao.updateCredits(id, creditsCents, "manual");

	if (
		creditsCents > 0 &&
		listing.is_active === 0 &&
		listing.health_status !== "dead"
	) {
		await c.env.DB.prepare(
			"UPDATE credit_listings SET is_active = 1 WHERE id = ?",
		)
			.bind(id)
			.run();
	}

	return c.json({
		id,
		credits: creditsCents / 100,
		message: "Credits updated",
	});
});

listingsRouter.delete("/:id", async (c) => {
	const listingsDao = new ListingsDao(c.env.DB);
	const success = await listingsDao.deleteListing(c.req.param("id"));
	if (!success) {
		throw new ApiError(
			"Credit listing not found",
			404,
			"not_found",
			"listing_not_found",
		);
	}
	return c.json({ message: "Credit listing removed", id: c.req.param("id") });
});

listingsRouter.patch("/:id/settings", async (c) => {
	const id = c.req.param("id");
	let body: { isEnabled?: number; priceMultiplier?: number };
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	const listingsDao = new ListingsDao(c.env.DB);
	const listing = await listingsDao.getListing(id);
	if (!listing) {
		throw new ApiError(
			"Credit listing not found",
			404,
			"not_found",
			"listing_not_found",
		);
	}

	const isEnabled = body.isEnabled ?? listing.is_enabled;
	const priceMultiplier = body.priceMultiplier ?? listing.price_multiplier;

	await listingsDao.updateListingSettings(id, isEnabled, priceMultiplier);

	return c.json({
		message: "Settings updated",
		id,
		isEnabled,
		priceMultiplier,
	});
});

listingsRouter.get("/:id/credits", async (c) => {
	const id = c.req.param("id");
	const listingsDao = new ListingsDao(c.env.DB);
	const listing = await listingsDao.getListing(id);

	if (!listing) {
		throw new ApiError(
			"Credit listing not found",
			404,
			"not_found",
			"listing_not_found",
		);
	}

	const result: Record<string, unknown> = {
		id: listing.id,
		provider: listing.provider,
		credits: listing.credits_cents / 100,
		creditsSource: listing.credits_source,
	};

	if (listing.credits_source === "auto") {
		const provider = getProvider(listing.provider);
		if (provider) {
			const cnyRate = parseFloat(c.env.CNY_USD_RATE || "7");
			const upstream = await provider.fetchCredits(listing.api_key);
			if (upstream?.remaining != null) {
				const newCents = toUsdCents(
					upstream.remaining,
					provider.info.currency,
					cnyRate,
				);
				await listingsDao.updateCredits(id, newCents, "auto");
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

export default listingsRouter;

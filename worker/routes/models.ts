import { Hono } from "hono";
import { PricingDao } from "../core/db/pricing-dao";
import type { AppEnv } from "../shared/types";

/**
 * /v1/models — OpenRouter-aligned public API.
 * Returns the canonical model catalog (one entry per model) with full metadata
 * directly from OpenRouter's data. Response format matches OpenRouter's /api/v1/models.
 */
export const publicModelsRouter = new Hono<AppEnv>();

publicModelsRouter.get("/", async (c) => {
	const dao = new PricingDao(c.env.DB);
	const rows = await dao.getOpenRouterCatalog();
	const data = rows
		.map((r) => {
			try {
				return JSON.parse(r.metadata!);
			} catch {
				return null;
			}
		})
		.filter(Boolean);

	return c.json({ data });
});

/**
 * /api/models — Internal management API for dashboard.
 * Returns all provider offerings with pricing details for multi-provider comparison.
 */
export const dashboardModelsRouter = new Hono<AppEnv>();

dashboardModelsRouter.get("/", async (c) => {
	const dao = new PricingDao(c.env.DB);
	const all = await dao.getActivePricingWithBestMultiplier();

	const data = all.map((m) => {
		const mul = m.best_multiplier;
		return {
			id: m.model_id,
			provider: m.provider,
			name: m.name,
			input_price: m.input_price,
			output_price: m.output_price,
			...(mul != null &&
				mul < 1 && {
				platform_input_price: m.input_price * mul,
				platform_output_price: m.output_price * mul,
			}),
			context_length: m.context_length,
			created_at: m.created_at || null,
			input_modalities: m.input_modalities
				? JSON.parse(m.input_modalities)
				: null,
			output_modalities: m.output_modalities
				? JSON.parse(m.output_modalities)
				: null,
		};
	});

	return c.json({ data });
});

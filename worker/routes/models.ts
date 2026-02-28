import { Hono } from "hono";
import { CandleDao } from "../core/db/candle-dao";
import { PricingDao } from "../core/db/pricing-dao";
import type { AppEnv } from "../shared/types";

/**
 * /v1/models — Public API, one entry per model.
 *
 * Pricing uses pre-aggregated candle data (updated every minute):
 * - prompt/completion from model:input / model:output candle close prices
 * - Multi-modal prices derived via discount ratio against metadata
 * - Zero real-time computation per request
 */
export const publicModelsRouter = new Hono<AppEnv>();

publicModelsRouter.get("/", async (c) => {
	const dao = new PricingDao(c.env.DB);
	const candleDao = new CandleDao(c.env.DB);

	const [all, inputPrices, outputPrices] = await Promise.all([
		dao.getActivePricingWithBestMultiplier(),
		candleDao.getLatestPrices("model:input"),
		candleDao.getLatestPrices("model:output"),
	]);

	// cents-per-M-tokens → USD-per-token string (OpenRouter format)
	const toUsdPerToken = (centsPerM: number) => String(centsPerM / 100_000_000);

	// Group by model_id (Map preserves insertion order = sort_order)
	const groups = new Map<
		string,
		{
			meta: Record<string, unknown> | null;
			providers: string[];
			name: string | null;
			contextLength: number | null;
		}
	>();

	for (const row of all) {
		let g = groups.get(row.model_id);
		if (!g) {
			const meta = row.metadata ? JSON.parse(row.metadata) : null;
			g = {
				meta,
				providers: [],
				name: row.name,
				contextLength: row.context_length,
			};
			groups.set(row.model_id, g);
		}

		if (row.best_multiplier != null) {
			if (!g.providers.includes(row.provider)) g.providers.push(row.provider);
		}
	}

	const data = [...groups.entries()].map(([id, g]) => {
		const m = g.meta;

		// Build pricing from candle data
		const basePricing = (m?.pricing as Record<string, string>) ?? {};
		const pricing: Record<string, string> = { ...basePricing };

		const inputClose = inputPrices.get(id);
		const outputClose = outputPrices.get(id);

		if (inputClose != null) {
			pricing.prompt = toUsdPerToken(inputClose);

			// Derive discount ratio for multi-modal pricing
			const originalPrompt =
				Number.parseFloat(basePricing.prompt || "0") * 100_000_000;
			if (originalPrompt > 0) {
				const ratio = inputClose / originalPrompt;
				for (const [key, val] of Object.entries(basePricing)) {
					if (key !== "prompt" && key !== "completion" && val) {
						pricing[key] = String(Number.parseFloat(val) * ratio);
					}
				}
			}
		}
		if (outputClose != null) {
			pricing.completion = toUsdPerToken(outputClose);
		}

		return {
			id,
			name: (m?.name as string) ?? g.name ?? id,
			created: (m?.created as number) ?? 0,
			description: (m?.description as string) ?? null,
			hugging_face_id: (m?.hugging_face_id as string) ?? null,
			context_length: (m?.context_length as number) ?? g.contextLength,
			pricing,
			architecture: (m?.architecture as Record<string, unknown>) ?? null,
			supported_parameters: (m?.supported_parameters as string[]) ?? null,
			providers: g.providers,
		};
	});

	return c.json({ data });
});

/**
 * /api/models — Dashboard API, multi-provider comparison.
 * Returns all provider offerings with per-provider pricing.
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

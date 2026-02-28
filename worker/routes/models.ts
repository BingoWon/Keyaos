import { Hono } from "hono";
import { PricingDao } from "../core/db/pricing-dao";
import type { AppEnv } from "../shared/types";

/**
 * /v1/models — Public API, one entry per model.
 *
 * Aggregates across all providers to show:
 * - Best effective pricing (cheapest provider × credential multiplier)
 * - Full pricing breakdown from OpenRouter metadata (image, audio, cache, etc.)
 * - Available providers list
 * - Model capabilities (modalities, supported_parameters, description)
 *
 * prompt/completion prices are overridden with our best effective price;
 * other pricing dimensions (image, audio, cache) are passed through from metadata.
 */
export const publicModelsRouter = new Hono<AppEnv>();

publicModelsRouter.get("/", async (c) => {
	const dao = new PricingDao(c.env.DB);
	const all = await dao.getActivePricingWithBestMultiplier();

	// cents-per-M-tokens → USD-per-token string (OpenRouter format)
	const toUsdPerToken = (centsPerM: number) =>
		String(centsPerM / 100_000_000);

	// Group by model_id (Map preserves insertion order = sort_order)
	const groups = new Map<
		string,
		{
			meta: Record<string, unknown> | null;
			bestInput: number;
			bestOutput: number;
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
				bestInput: Infinity,
				bestOutput: Infinity,
				providers: [],
				name: row.name,
				contextLength: row.context_length,
			};
			groups.set(row.model_id, g);
		}

		const mul = row.best_multiplier ?? 1;
		const ei = row.input_price * mul;
		const eo = row.output_price * mul;
		if (ei < g.bestInput) g.bestInput = ei;
		if (eo < g.bestOutput) g.bestOutput = eo;
		if (!g.providers.includes(row.provider)) g.providers.push(row.provider);
	}

	const data = [...groups.entries()].map(([id, g]) => {
		const m = g.meta;
		const arch = m?.architecture as Record<string, unknown> | undefined;

		// Build pricing: keep multi-modal dimensions from metadata, override prompt/completion
		const basePricing = (m?.pricing as Record<string, string>) ?? {};
		const pricing: Record<string, string> = { ...basePricing };
		pricing.prompt = toUsdPerToken(g.bestInput);
		pricing.completion = toUsdPerToken(g.bestOutput);

		return {
			id,
			name: (m?.name as string) ?? g.name ?? id,
			created: (m?.created as number) ?? 0,
			description: (m?.description as string) ?? null,
			context_length: (m?.context_length as number) ?? g.contextLength,
			pricing,
			architecture: arch
				? {
					input_modalities: arch.input_modalities,
					output_modalities: arch.output_modalities,
				}
				: null,
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

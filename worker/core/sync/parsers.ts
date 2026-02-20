/**
 * Provider-specific price parsers
 *
 * Each parser normalizes a provider's raw /models JSON response
 * into a flat array suitable for ModelsDao.upsertModels().
 *
 * All prices are normalized to: integer USD cents per 1M tokens.
 */
import type { DbModel } from "../db/schema";

type ParsedModel = Omit<DbModel, "synced_at">;

/** USD dollars → integer cents per 1M tokens */
const dollarsToCentsPerM = (usd: number): number => Math.round(usd * 100);

// ─── OpenRouter ────────────────────────────────────────────
// pricing.prompt/completion are strings representing USD per token
// Multiply by 1,000,000 to get USD/M, then × 100 for cents/M

export function parseOpenRouter(raw: { data?: unknown[] }): ParsedModel[] {
	if (!raw?.data) return [];
	const results: ParsedModel[] = [];

	for (const m of raw.data as Record<string, unknown>[]) {
		const id = m.id as string;
		const pricing = m.pricing as Record<string, string> | undefined;
		if (!id || !pricing?.prompt || !pricing?.completion) continue;

		const inputUsdPerM = parseFloat(pricing.prompt) * 1_000_000;
		const outputUsdPerM = parseFloat(pricing.completion) * 1_000_000;
		if (Number.isNaN(inputUsdPerM) || Number.isNaN(outputUsdPerM)) continue;

		results.push({
			id: `openrouter:${id}`,
			provider: "openrouter",
			upstream_id: id,
			display_name: (m.name as string) || null,
			input_cost: dollarsToCentsPerM(inputUsdPerM),
			output_cost: dollarsToCentsPerM(outputUsdPerM),
			context_length: (m.context_length as number) || null,
			is_active: 1,
		});
	}
	return results;
}

// ─── ZenMux ────────────────────────────────────────────────
// pricings.prompt/completion are arrays of { value, unit, currency, conditions }
// value is already in perMTokens USD, take first tier

export function parseZenMux(raw: { data?: unknown[] }): ParsedModel[] {
	if (!raw?.data) return [];
	const results: ParsedModel[] = [];

	for (const m of raw.data as Record<string, unknown>[]) {
		const id = m.id as string;
		const pricings = m.pricings as Record<string, unknown[]> | undefined;
		if (!id || !pricings) continue;

		const promptArr = pricings.prompt as { value: number }[] | undefined;
		const compArr = pricings.completion as { value: number }[] | undefined;
		if (!promptArr?.[0] || !compArr?.[0]) continue;

		results.push({
			id: `zenmux:${id}`,
			provider: "zenmux",
			upstream_id: id,
			display_name: (m.display_name as string) || null,
			input_cost: dollarsToCentsPerM(promptArr[0].value),
			output_cost: dollarsToCentsPerM(compArr[0].value),
			context_length: (m.context_length as number) || null,
			is_active: 1,
		});
	}
	return results;
}

// ─── DeepInfra ─────────────────────────────────────────────
// metadata.pricing.input_tokens/output_tokens are numbers in USD per 1M tokens

export function parseDeepInfra(raw: { data?: unknown[] }): ParsedModel[] {
	if (!raw?.data) return [];
	const results: ParsedModel[] = [];

	for (const m of raw.data as Record<string, unknown>[]) {
		const id = m.id as string;
		const metadata = m.metadata as Record<string, unknown> | undefined;
		const pricing = metadata?.pricing as
			| { input_tokens: number; output_tokens: number }
			| undefined;
		if (!id || !pricing) continue;

		results.push({
			id: `deepinfra:${id}`,
			provider: "deepinfra",
			upstream_id: id,
			display_name: null, // DeepInfra has no display name field
			input_cost: dollarsToCentsPerM(pricing.input_tokens),
			output_cost: dollarsToCentsPerM(pricing.output_tokens),
			context_length: (metadata?.context_length as number) || null,
			is_active: 1,
		});
	}
	return results;
}

// ─── DeepSeek ──────────────────────────────────────────────
// /models returns no pricing info. Prices are hardcoded from
// https://api-docs.deepseek.com/quick_start/pricing
// All values in CNY/M tokens, converted to USD cents at build time.

export function parseDeepSeek(
	_raw: { data?: unknown[] },
	cnyUsdRate = 7,
): ParsedModel[] {
	// DeepSeek pricing (CNY per 1M tokens):
	// deepseek-chat:     input ¥1,  output ¥2
	// deepseek-reasoner: input ¥4,  output ¥16
	const models: {
		id: string;
		inputCny: number;
		outputCny: number;
		ctx: number;
	}[] = [
		{ id: "deepseek-chat", inputCny: 1, outputCny: 2, ctx: 131072 },
		{ id: "deepseek-reasoner", inputCny: 4, outputCny: 16, ctx: 131072 },
	];

	return models.map((m) => ({
		id: `deepseek:${m.id}`,
		provider: "deepseek",
		upstream_id: m.id,
		display_name: m.id === "deepseek-chat" ? "DeepSeek V3" : "DeepSeek R1",
		input_cost: Math.round((m.inputCny / cnyUsdRate) * 100),
		output_cost: Math.round((m.outputCny / cnyUsdRate) * 100),
		context_length: m.ctx,
		is_active: 1,
	}));
}

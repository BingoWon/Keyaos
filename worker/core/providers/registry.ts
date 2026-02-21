/**
 * Provider Registry — SINGLE SOURCE OF TRUTH
 *
 * Every provider-specific detail lives here. To add a new provider,
 * add one entry to PROVIDER_CONFIGS. No other file needs changing.
 */
import type {
	ParsedModel,
	ProviderAdapter,
	ProviderCredits,
} from "./interface";
import {
	dollarsToCentsPerM,
	OpenAICompatibleAdapter,
	type OpenAICompatibleConfig,
} from "./openai-compatible";

// ─── Custom parsers ─────────────────────────────────────────

/** OpenRouter: pricing.prompt/completion are USD per token (strings) */
function parseOpenRouterModels(raw: Record<string, unknown>): ParsedModel[] {
	const data = raw.data as Record<string, unknown>[] | undefined;
	if (!data) return [];
	const results: ParsedModel[] = [];

	for (const m of data) {
		const id = m.id as string;
		const pricing = m.pricing as Record<string, string> | undefined;
		if (!id || !pricing?.prompt || !pricing?.completion) continue;

		const inputUsdPerM = Number.parseFloat(pricing.prompt) * 1_000_000;
		const outputUsdPerM = Number.parseFloat(pricing.completion) * 1_000_000;
		if (Number.isNaN(inputUsdPerM) || Number.isNaN(outputUsdPerM)) continue;

		results.push({
			id: `openrouter:${id}`,
			provider: "openrouter",
			upstream_id: id,
			display_name: (m.name as string) || null,
			input_price: dollarsToCentsPerM(inputUsdPerM),
			output_price: dollarsToCentsPerM(outputUsdPerM),
			context_length: (m.context_length as number) || null,
			is_active: 1,
		});
	}
	return results;
}

/** ZenMux: pricings.prompt/completion are arrays of { value } in USD/M tokens */
function parseZenMuxModels(raw: Record<string, unknown>): ParsedModel[] {
	const data = raw.data as Record<string, unknown>[] | undefined;
	if (!data) return [];
	const results: ParsedModel[] = [];

	for (const m of data) {
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
			input_price: dollarsToCentsPerM(promptArr[0].value),
			output_price: dollarsToCentsPerM(compArr[0].value),
			context_length: (m.context_length as number) || null,
			is_active: 1,
		});
	}
	return results;
}

/** DeepInfra: metadata.pricing.input_tokens/output_tokens in USD/M tokens */
function parseDeepInfraModels(raw: Record<string, unknown>): ParsedModel[] {
	const data = raw.data as Record<string, unknown>[] | undefined;
	if (!data) return [];
	const results: ParsedModel[] = [];

	for (const m of data) {
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
			display_name: null,
			input_price: dollarsToCentsPerM(pricing.input_tokens),
			output_price: dollarsToCentsPerM(pricing.output_tokens),
			context_length: (metadata?.context_length as number) || null,
			is_active: 1,
		});
	}
	return results;
}

/**
 * DeepSeek: /models has no pricing.
 * Hardcoded from https://api-docs.deepseek.com/quick_start/pricing
 * Prices in CNY/M tokens, converted at runtime.
 */
function parseDeepSeekModels(
	_raw: Record<string, unknown>,
	cnyUsdRate: number,
): ParsedModel[] {
	const models = [
		{
			id: "deepseek-chat",
			name: "DeepSeek V3",
			inputCny: 1,
			outputCny: 2,
			ctx: 131072,
		},
		{
			id: "deepseek-reasoner",
			name: "DeepSeek R1",
			inputCny: 4,
			outputCny: 16,
			ctx: 131072,
		},
	];

	return models.map((m) => ({
		id: `deepseek:${m.id}`,
		provider: "deepseek",
		upstream_id: m.id,
		display_name: m.name,
		input_price: Math.round((m.inputCny / cnyUsdRate) * 100),
		output_price: Math.round((m.outputCny / cnyUsdRate) * 100),
		context_length: m.ctx,
		is_active: 1,
	}));
}

/** DeepSeek /user/balance credits parser */
function parseDeepSeekCredits(
	json: Record<string, unknown>,
): ProviderCredits | null {
	const infos = json.balance_infos as
		| { currency: string; total_balance: string }[]
		| undefined;
	if (!infos?.[0]) return null;
	const balance = Number.parseFloat(infos[0].total_balance);
	if (Number.isNaN(balance)) return null;
	return { remaining: balance, usage: null };
}

// ─── Provider configs ───────────────────────────────────────
// To add a new provider: add one entry here. Nothing else.

const PROVIDER_CONFIGS: OpenAICompatibleConfig[] = [
	{
		id: "openrouter",
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		currency: "USD",
		supportsAutoCredits: true,
		creditsUrl: "https://openrouter.ai/api/v1/credits",
		validationUrl: "https://openrouter.ai/api/v1/auth/key",
		parseModels: parseOpenRouterModels,
	},
	{
		id: "zenmux",
		name: "ZenMux",
		baseUrl: "https://zenmux.ai/api/v1",
		currency: "USD",
		supportsAutoCredits: false,
		validationUrl: "https://zenmux.ai/api/v1/generation?id=_validate",
		parseModels: parseZenMuxModels,
	},
	{
		id: "deepinfra",
		name: "DeepInfra",
		baseUrl: "https://api.deepinfra.com/v1/openai",
		currency: "USD",
		supportsAutoCredits: false,
		parseModels: parseDeepInfraModels,
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		currency: "CNY",
		supportsAutoCredits: true,
		creditsUrl: "https://api.deepseek.com/user/balance",
		parseCredits: parseDeepSeekCredits,
		parseModels: parseDeepSeekModels,
	},
];

// ─── Registry API ───────────────────────────────────────────

import { GeminiCliAdapter } from "./gemini-cli-adapter";

const adapters = new Map<string, ProviderAdapter>();
for (const config of PROVIDER_CONFIGS) {
	adapters.set(config.id, new OpenAICompatibleAdapter(config));
}

const geminiCliAdapter = new GeminiCliAdapter();
adapters.set("gemini-cli", geminiCliAdapter);

/** Call once per request to inject env-dependent config into adapters. */
export function configureProviders(env: {
	GEMINI_OAUTH_CLIENT_ID?: string;
	GEMINI_OAUTH_CLIENT_SECRET?: string;
}) {
	geminiCliAdapter.configure(env);
}

export function getProvider(id: string): ProviderAdapter | undefined {
	return adapters.get(id);
}

export function getAllProviders(): ProviderAdapter[] {
	return Array.from(adapters.values());
}

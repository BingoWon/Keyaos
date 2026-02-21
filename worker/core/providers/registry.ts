/**
 * Provider Registry — SINGLE SOURCE OF TRUTH
 *
 * OpenAI-compatible providers: add one entry to PROVIDER_CONFIGS.
 * Native-protocol providers (e.g. Gemini CLI): register separately below.
 */

import { GeminiCliAdapter } from "./gemini-cli-adapter";
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

/** Google AI Studio: pricing from models/google-ai-studio.json */
import googleAIStudioModels from "../models/google-ai-studio.json";

function parseGoogleAIStudioModels(): ParsedModel[] {
	return googleAIStudioModels.map((m) => ({
		id: `google-ai-studio:${m.upstream_id}`,
		provider: "google-ai-studio",
		upstream_id: m.upstream_id,
		display_name: m.display_name,
		input_price: dollarsToCentsPerM(m.input_usd),
		output_price: dollarsToCentsPerM(m.output_usd),
		context_length: m.context_length,
		is_active: 1,
	}));
}

/** DeepSeek: pricing from models/deepseek.json (CNY, converted at runtime) */
import deepseekModels from "../models/deepseek.json";

function parseDeepSeekModels(
	_raw: Record<string, unknown>,
	cnyUsdRate: number,
): ParsedModel[] {
	return deepseekModels.map((m) => ({
		id: `deepseek:${m.upstream_id}`,
		provider: "deepseek",
		upstream_id: m.upstream_id,
		display_name: m.display_name,
		input_price: Math.round((m.input_cny / cnyUsdRate) * 100),
		output_price: Math.round((m.output_cny / cnyUsdRate) * 100),
		context_length: m.context_length,
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
	{
		id: "google-ai-studio",
		name: "Google AI Studio",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
		currency: "USD",
		supportsAutoCredits: false,
		parseModels: () => parseGoogleAIStudioModels(),
	},
];

// ─── Registry API ───────────────────────────────────────────

const adapters = new Map<string, ProviderAdapter>();
for (const config of PROVIDER_CONFIGS) {
	adapters.set(config.id, new OpenAICompatibleAdapter(config));
}

adapters.set("gemini-cli", new GeminiCliAdapter());

export function getProvider(id: string): ProviderAdapter | undefined {
	return adapters.get(id);
}

export function getAllProviders(): ProviderAdapter[] {
	return Array.from(adapters.values());
}

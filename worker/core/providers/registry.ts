/**
 * Provider Registry — SINGLE SOURCE OF TRUTH
 *
 * OpenAI-compatible providers: add one entry to PROVIDER_CONFIGS.
 * Native-protocol providers (e.g. Gemini CLI): register separately below.
 */

import deepseekModels from "../models/deepseek.json";
import googleAIStudioModels from "../models/google-ai-studio.json";
import oaiproModels from "../models/oaipro.json";
import openaiModels from "../models/openai.json";
import qwenCodeModels from "../models/qwen-code.json";
import { antigravityAdapter, geminiCliAdapter } from "./google-oauth-adapter";
import type {
	ParsedModel,
	ProviderAdapter,
	ProviderCredits,
} from "./interface";
import { kiroAdapter } from "./kiro-adapter";
import {
	dollarsToCentsPerM,
	OpenAICompatibleAdapter,
	type OpenAICompatibleConfig,
} from "./openai-compatible";

// ─── Dynamic parsers (parse upstream API response) ──────────

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
			model_id: id,
			name: (m.name as string) || null,
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
			model_id: id,
			name: (m.display_name as string) || null,
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
			model_id: id,
			name: null,
			input_price: dollarsToCentsPerM(pricing.input_tokens),
			output_price: dollarsToCentsPerM(pricing.output_tokens),
			context_length: (metadata?.context_length as number) || null,
			is_active: 1,
		});
	}
	return results;
}

// ─── Static parsers (read from models/*.json, no HTTP) ──────

interface StaticModelEntry {
	id: string;
	name: string | null;
	input_usd: number;
	output_usd: number;
	context_length: number | null;
}

function parseStaticUsdModels(
	provider: string,
	models: StaticModelEntry[],
): ParsedModel[] {
	return models.map((m) => ({
		id: `${provider}:${m.id}`,
		provider,
		model_id: m.id,
		name: m.name,
		input_price: dollarsToCentsPerM(m.input_usd),
		output_price: dollarsToCentsPerM(m.output_usd),
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

// ─── Shared validation helpers ──────────────────────────────

/** Validate API key via a minimal chat completion (for providers where /models is unusable) */
function validateViaChat(
	url: string,
	model: string,
): (secret: string) => Promise<boolean> {
	return async (secret) => {
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${secret}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					messages: [{ role: "user", content: "." }],
					max_tokens: 1,
				}),
			});
			return res.ok;
		} catch {
			return false;
		}
	};
}

// ─── Provider configs ───────────────────────────────────────
// To add a new provider: add one entry here. Nothing else.

const PROVIDER_CONFIGS: OpenAICompatibleConfig[] = [
	{
		id: "openrouter",
		name: "OpenRouter",
		logoUrl: "https://api.iconify.design/simple-icons:openrouter.svg",
		baseUrl: "https://openrouter.ai/api/v1",
		currency: "USD",
		supportsAutoCredits: true,
		creditsUrl: "https://openrouter.ai/api/v1/credits",
		validationUrl: "https://openrouter.ai/api/v1/auth/key",
		parseModels: parseOpenRouterModels,
		credentialGuide: {
			placeholder: "sk-or-v1-...",
			steps: [
				"Go to https://openrouter.ai/settings/keys",
				"Create a new API key and copy it",
			],
		},
	},
	{
		id: "zenmux",
		name: "ZenMux",
		logoUrl: "https://zenmux.ai/favicon.ico",
		baseUrl: "https://zenmux.ai/api/v1",
		currency: "USD",
		supportsAutoCredits: false,
		parseModels: parseZenMuxModels,
		customValidateKey: validateViaChat(
			"https://zenmux.ai/api/v1/chat/completions",
			"google/gemma-3-12b-it",
		),
		credentialGuide: {
			placeholder: "sk-...",
			steps: [
				"Go to https://zenmux.ai and sign in",
				"Navigate to API Keys page and create a new key",
			],
		},
	},
	{
		id: "deepinfra",
		name: "DeepInfra",
		logoUrl: "https://deepinfra.com/favicon.ico",
		baseUrl: "https://api.deepinfra.com/v1/openai",
		currency: "USD",
		supportsAutoCredits: false,
		parseModels: parseDeepInfraModels,
		credentialGuide: {
			placeholder: "sk-...",
			steps: [
				"Go to https://deepinfra.com/dash/api_keys",
				"Create a new API key and copy it",
			],
		},
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		logoUrl: "https://cdn.deepseek.com/platform/favicon.png",
		baseUrl: "https://api.deepseek.com",
		currency: "USD",
		supportsAutoCredits: true,
		creditsUrl: "https://api.deepseek.com/user/balance",
		parseCredits: parseDeepSeekCredits,
		staticModels: true,
		stripModelPrefix: true,
		parseModels: () => parseStaticUsdModels("deepseek", deepseekModels),
		credentialGuide: {
			placeholder: "sk-...",
			steps: [
				"Go to https://platform.deepseek.com/api_keys",
				"Create a new API key and copy it",
			],
		},
	},
	{
		id: "google-ai-studio",
		name: "Google AI Studio",
		logoUrl: "https://api.iconify.design/simple-icons:google.svg",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
		currency: "USD",
		supportsAutoCredits: false,
		staticModels: true,
		stripModelPrefix: true,
		parseModels: () =>
			parseStaticUsdModels("google-ai-studio", googleAIStudioModels),
		credentialGuide: {
			placeholder: "AIza...",
			steps: [
				"Go to https://aistudio.google.com/apikey",
				"Create a new API key and copy it",
			],
		},
	},
	{
		id: "oaipro",
		name: "OAIPro",
		logoUrl: "https://api.oaipro.com/oaipro-logo-ab5e620c9f.png",
		baseUrl: "https://api.oaipro.com/v1",
		currency: "USD",
		supportsAutoCredits: false,
		staticModels: true,
		stripModelPrefix: true,
		parseModels: () => parseStaticUsdModels("oaipro", oaiproModels),
		credentialGuide: {
			placeholder: "sk-...",
			steps: [
				"Go to https://oaipro.com dashboard",
				"Create a new API key and copy it",
			],
		},
	},
	{
		id: "openai",
		name: "OpenAI",
		logoUrl: "https://openai.com/favicon.ico",
		baseUrl: "https://api.openai.com/v1",
		currency: "USD",
		supportsAutoCredits: false,
		staticModels: true,
		stripModelPrefix: true,
		parseModels: () => parseStaticUsdModels("openai", openaiModels),
		credentialGuide: {
			placeholder: "sk-...",
			steps: [
				"Go to https://platform.openai.com/api-keys",
				"Create a new secret key and copy it",
			],
		},
	},
	{
		id: "qwen-code",
		name: "Qwen Code",
		logoUrl: "https://qwenlm.github.io/favicon.png",
		baseUrl: "https://coding.dashscope.aliyuncs.com/v1",
		currency: "USD",
		supportsAutoCredits: false,
		isSubscription: true,
		staticModels: true,
		stripModelPrefix: true,
		parseModels: () => parseStaticUsdModels("qwen-code", qwenCodeModels),
		customValidateKey: validateViaChat(
			"https://coding.dashscope.aliyuncs.com/v1/chat/completions",
			"qwen3-coder-plus",
		),
		credentialGuide: {
			placeholder: "sk-sp-...",
			steps: [
				"Open Tongyi Lingma IDE plugin settings",
				"Copy the API key from the plugin configuration",
			],
		},
	},
];

// ─── Registry API ───────────────────────────────────────────

const adapters = new Map<string, ProviderAdapter>();
for (const config of PROVIDER_CONFIGS) {
	adapters.set(config.id, new OpenAICompatibleAdapter(config));
}

adapters.set("gemini-cli", geminiCliAdapter);
adapters.set("antigravity", antigravityAdapter);
adapters.set("kiro", kiroAdapter);

export function getProvider(id: string): ProviderAdapter | undefined {
	return adapters.get(id);
}

export function getAllProviders(): ProviderAdapter[] {
	return Array.from(adapters.values());
}

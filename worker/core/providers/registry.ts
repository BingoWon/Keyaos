/**
 * Provider Registry — SINGLE SOURCE OF TRUTH
 *
 * OpenAI-compatible providers: add one entry to PROVIDER_CONFIGS.
 * Native-protocol providers (e.g. Gemini CLI): register separately below.
 */

import type { ModelType } from "../db/schema";
import deepseekModels from "../models/deepseek.json";
import googleAIStudioModels from "../models/google-ai-studio.json";
import moonshotModels from "../models/moonshot.json";
import oaiproModels from "../models/oaipro.json";
import openaiModels from "../models/openai.json";
import qwenCodeModels from "../models/qwen-code.json";
import { anthropicAdapter } from "./anthropic-adapter";
import { antigravityAdapter, geminiCliAdapter } from "./google-oauth-adapter";
import {
	parseStaticModels,
	type ParsedModel,
	type ProviderAdapter,
	type ProviderCredits,
} from "./interface";
import { kiroAdapter } from "./kiro-adapter";
import {
	OpenAICompatibleAdapter,
	type OpenAICompatibleConfig,
} from "./openai-compatible";

// ─── Helpers ────────────────────────────────────────────────

function serializeModalities(arr: unknown): string | null {
	if (!Array.isArray(arr) || arr.length === 0) return null;
	return JSON.stringify(
		arr.filter((x): x is string => typeof x === "string").sort(),
	);
}

// ─── Dynamic parsers (parse upstream API response) ──────────

/** OpenRouter: pricing.prompt/completion are USD per token (strings). Shared by chat and embedding endpoints. */
export function parseOpenRouterModels(
	raw: Record<string, unknown>,
	modelType: ModelType = "chat",
): ParsedModel[] {
	const data = raw.data as Record<string, unknown>[] | undefined;
	if (!data) return [];
	const results: ParsedModel[] = [];
	const now = Date.now();

	for (const m of data) {
		const id = m.id as string;
		const pricing = m.pricing as Record<string, string> | undefined;
		if (!id || !pricing?.prompt) continue;

		const inputUsdPerM = Number.parseFloat(pricing.prompt) * 1_000_000;
		const outputUsdPerM =
			Number.parseFloat(pricing.completion || "0") * 1_000_000;
		if (Number.isNaN(inputUsdPerM) || inputUsdPerM < 0) continue;

		const arch = m.architecture as Record<string, unknown> | undefined;
		const createdMs = ((m.created as number) || 0) * 1000;
		results.push({
			id: `openrouter:${id}`,
			provider_id: "openrouter",
			model_id: id,
			name: (m.name as string) || null,
			model_type: modelType,
			input_price: inputUsdPerM,
			output_price: outputUsdPerM,
			context_length: (m.context_length as number) || null,
			input_modalities: serializeModalities(arch?.input_modalities),
			output_modalities: serializeModalities(arch?.output_modalities),
			upstream_model_id: null,
			metadata: JSON.stringify(m),
			created: createdMs || now,
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
			provider_id: "zenmux",
			model_id: id,
			name: (m.display_name as string) || null,
			model_type: "chat",
			input_price: promptArr[0].value,
			output_price: compArr[0].value,
			context_length: (m.context_length as number) || null,
			input_modalities: serializeModalities(m.input_modalities),
			output_modalities: serializeModalities(m.output_modalities),
			upstream_model_id: null,
			metadata: null,
			created: Date.now(),
		});
	}
	return results;
}

/** DeepInfra: metadata.pricing.input_tokens/output_tokens in USD/M tokens.
 *  Models without pricing (e.g. embeddings) are emitted with price = -1;
 *  the sync service enriches them from the OpenRouter canonical catalog. */
function parseDeepInfraModels(raw: Record<string, unknown>): ParsedModel[] {
	const data = raw.data as Record<string, unknown>[] | undefined;
	if (!data) return [];
	const results: ParsedModel[] = [];

	for (const m of data) {
		const id = m.id as string;
		if (!id) continue;

		const metadata = m.metadata as Record<string, unknown> | undefined;
		const pricing = metadata?.pricing as
			| { input_tokens: number; output_tokens: number }
			| undefined;

		const canonicalId = id.toLowerCase();
		results.push({
			id: `deepinfra:${canonicalId}`,
			provider_id: "deepinfra",
			model_id: canonicalId,
			name: null,
			model_type: "chat",
			input_price: pricing?.input_tokens ?? -1,
			output_price: pricing?.output_tokens ?? -1,
			context_length: (metadata?.context_length as number) || null,
			input_modalities: null,
			output_modalities: null,
			upstream_model_id: id !== canonicalId ? id : null,
			metadata: null,
			created: Date.now(),
		});
	}
	return results;
}

// ─── Credits parsers ────────────────────────────────────────

/** DeepSeek /user/balance → { balance_infos: [{ total_balance }] } (CNY) */
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

/** Moonshot /users/me/balance → { data: { available_balance } } (CNY) */
function parseMoonshotCredits(
	json: Record<string, unknown>,
): ProviderCredits | null {
	const data = json.data as { available_balance?: number } | undefined;
	if (data?.available_balance == null) return null;
	return { remaining: data.available_balance, usage: null };
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
		logoUrl: "https://openrouter.ai/favicon.ico",
		baseUrl: "https://openrouter.ai/api/v1",
		currency: "USD",
		supportsAutoCredits: true,
		creditsUrl: "https://openrouter.ai/api/v1/credits",
		validationUrl: "https://openrouter.ai/api/v1/auth/key",
		parseModels: (raw) => parseOpenRouterModels(raw),
		extraHeaders: {
			"HTTP-Referer": "https://github.com/BingoWon/Keyaos",
			"X-Title": "Keyaos",
		},
		credentialGuide: {
			placeholder: "sk-or-v1-...",
			secretPattern: "^sk-or-v1-[a-f0-9]+$",
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
			placeholder: "sk-ai-v1-...",
			secretPattern: "^sk-ai-v1-[a-f0-9]+$",
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
			placeholder: "Paste your API token",
		},
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		logoUrl: "https://www.deepseek.com/favicon.ico",
		baseUrl: "https://api.deepseek.com",
		currency: "CNY",
		supportsAutoCredits: true,
		creditsUrl: "https://api.deepseek.com/user/balance",
		parseCredits: parseDeepSeekCredits,
		staticModels: true,
		stripModelPrefix: true,
		parseModels: () => parseStaticModels("deepseek", deepseekModels),
		systemKeyEnvVar: "DEEPSEEK_KEY",
		mapModelId: (id) => `deepseek/${id}`,
		credentialGuide: {
			placeholder: "sk-...",
			secretPattern: "^sk-[a-f0-9]+$",
		},
	},
	{
		id: "google-ai-studio",
		name: "Google AI Studio",
		logoUrl: "https://www.gstatic.com/aistudio/ai_studio_favicon_2_128x128.png",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
		currency: "USD",
		supportsAutoCredits: false,
		staticModels: true,
		stripModelPrefix: true,
		parseModels: () =>
			parseStaticModels("google-ai-studio", googleAIStudioModels),
		systemKeyEnvVar: "GEMINI_KEY",
		mapModelId: (id) => `google/${id.replace(/^models\//, "")}`,
		credentialGuide: {
			placeholder: "AIza...",
			secretPattern: "^AIza[A-Za-z0-9_-]+$",
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
		parseModels: () => parseStaticModels("oaipro", oaiproModels),
		credentialGuide: {
			placeholder: "sk-...",
			secretPattern: "^sk-[A-Za-z0-9]+$",
		},
	},
	{
		id: "openai",
		name: "OpenAI",
		logoUrl: "https://api.iconify.design/logos:openai-icon.svg",
		baseUrl: "https://api.openai.com/v1",
		currency: "USD",
		supportsAutoCredits: false,
		staticModels: true,
		stripModelPrefix: true,
		parseModels: () => parseStaticModels("openai", openaiModels),
		systemKeyEnvVar: "OPENAI_KEY",
		mapModelId: (id) => `openai/${id}`,
		credentialGuide: {
			placeholder: "sk-proj-...",
			secretPattern: "^sk-(proj-)?[A-Za-z0-9_-]+$",
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
		parseModels: () => parseStaticModels("qwen-code", qwenCodeModels),
		customValidateKey: validateViaChat(
			"https://coding.dashscope.aliyuncs.com/v1/chat/completions",
			"qwen3-coder-plus",
		),
		credentialGuide: {
			placeholder: "sk-sp-...",
			secretPattern: "^sk-sp-[a-f0-9]+$",
		},
	},
	{
		id: "moonshot",
		name: "Moonshot",
		logoUrl: "https://statics.moonshot.cn/moonshot-ai/favicon.ico",
		baseUrl: "https://api.moonshot.cn/v1",
		currency: "CNY",
		supportsAutoCredits: true,
		creditsUrl: "https://api.moonshot.cn/v1/users/me/balance",
		parseCredits: parseMoonshotCredits,
		staticModels: true,
		stripModelPrefix: true,
		parseModels: () => parseStaticModels("moonshot", moonshotModels),
		credentialGuide: {
			placeholder: "sk-...",
		},
	},
];

// ─── Registry API ───────────────────────────────────────────

const adapters = new Map<string, ProviderAdapter>();
for (const config of PROVIDER_CONFIGS) {
	adapters.set(config.id, new OpenAICompatibleAdapter(config));
}

adapters.set("anthropic", anthropicAdapter);
adapters.set("gemini-cli", geminiCliAdapter);
adapters.set("antigravity", antigravityAdapter);
adapters.set("kiro", kiroAdapter);

export function getProvider(id: string): ProviderAdapter | undefined {
	return adapters.get(id);
}

export function getAllProviders(): ProviderAdapter[] {
	return Array.from(adapters.values());
}

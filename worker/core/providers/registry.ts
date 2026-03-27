/**
 * Provider Registry — SINGLE SOURCE OF TRUTH
 *
 * OpenAI-compatible providers: add one entry to PROVIDER_CONFIGS.
 * Native-protocol providers (e.g. Gemini CLI): register separately below.
 */

import type { ModelType } from "../db/schema";
import { accioAdapter } from "./accio-adapter";
import { anthropicAdapter } from "./anthropic-adapter";
import { antigravityAdapter, geminiCliAdapter } from "./google-oauth-adapter";
import {
	type ParsedModel,
	type ProviderAdapter,
	type ProviderCredits,
	parseStaticModels,
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

/** Keyaos /v1/credits → { data: { balance } } (USD) */
function parseKeyaosCredits(
	json: Record<string, unknown>,
): ProviderCredits | null {
	const data = json.data as { balance?: number } | undefined;
	if (data?.balance == null) return null;
	return { remaining: data.balance, usage: null };
}

// ─── Keyaos self-provider catalog parser ────────────────────

/** Parse /api/catalog response into ParsedModel[], deduplicated by model_id (best price wins). */
function parseKeyaosCatalog(raw: Record<string, unknown>): ParsedModel[] {
	const data = raw.data as Record<string, unknown>[] | undefined;
	if (!data) return [];

	const best = new Map<string, ParsedModel>();
	const now = Date.now();

	for (const entry of data) {
		const modelId = entry.model_id as string;
		if (!modelId) continue;

		const inputPrice = (entry.input_price as number) ?? -1;
		if (inputPrice < 0) continue;

		const existing = best.get(modelId);
		if (existing && existing.input_price <= inputPrice) continue;

		best.set(modelId, {
			id: `keyaos:${modelId}`,
			provider_id: "keyaos",
			model_id: modelId,
			name: (entry.name as string) || null,
			model_type:
				((entry.model_type as string) || "chat") === "embedding"
					? "embedding"
					: "chat",
			input_price: inputPrice,
			output_price: (entry.output_price as number) ?? 0,
			context_length: (entry.context_length as number) || null,
			input_modalities: (entry.input_modalities as string) || null,
			output_modalities: (entry.output_modalities as string) || null,
			upstream_model_id: null,
			metadata: (entry.metadata as string) || null,
			created: (entry.created as number) || now,
		});
	}

	return [...best.values()];
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
		stripModelPrefix: true,
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
		stripModelPrefix: true,
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
		parseModels: () =>
			parseStaticModels("oaipro", [
				{ id: "openai/gpt-3.5-turbo" },
				{ id: "openai/gpt-3.5-turbo-16k" },
				{ id: "openai/gpt-3.5-turbo-instruct" },
				{ id: "openai/gpt-4" },
				{ id: "openai/gpt-4-1106-preview" },
				{ id: "openai/gpt-4-turbo" },
				{ id: "openai/gpt-4-turbo-preview" },
				{ id: "openai/gpt-4.1" },
				{ id: "openai/gpt-4.1-mini" },
				{ id: "openai/gpt-4.1-nano" },
				{ id: "openai/gpt-4o" },
				{ id: "openai/gpt-4o-2024-05-13" },
				{ id: "openai/gpt-4o-2024-08-06" },
				{ id: "openai/gpt-4o-2024-11-20" },
				{ id: "openai/gpt-4o-mini" },
				{ id: "openai/gpt-4o-mini-2024-07-18" },
				{ id: "openai/gpt-5" },
				{ id: "openai/gpt-5-mini" },
				{ id: "openai/gpt-5-nano" },
				{ id: "openai/gpt-5.1" },
				{ id: "openai/gpt-5.2" },
				{ id: "openai/o1" },
				{ id: "openai/o3" },
				{ id: "openai/o3-mini" },
				{ id: "openai/o4-mini" },
			]),
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
		stripModelPrefix: true,
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
		parseModels: () =>
			parseStaticModels("qwen-code", [
				{ id: "qwen/qwen3-coder-plus" },
				{ id: "qwen/qwen3-coder-next" },
				{ id: "qwen/qwen3-max", upstream_model_id: "qwen3-max-2026-01-23" },
				{ id: "z-ai/glm-5" },
				{ id: "z-ai/glm-4.7" },
				{ id: "moonshotai/kimi-k2.5" },
				{ id: "minimax/minimax-m2.5", upstream_model_id: "MiniMax-M2.5" },
			]),
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
		parseModels: () =>
			parseStaticModels("moonshot", [
				{ id: "moonshotai/kimi-k2.5" },
				{ id: "moonshotai/kimi-k2-thinking" },
				{
					id: "moonshotai/kimi-k2-0905",
					upstream_model_id: "kimi-k2-0905-preview",
				},
				{ id: "moonshotai/kimi-k2", upstream_model_id: "kimi-k2-0711-preview" },
			]),
		credentialGuide: {
			placeholder: "sk-...",
		},
	},
	{
		id: "xai",
		name: "xAI",
		logoUrl: "https://x.ai/favicon.ico",
		baseUrl: "https://api.x.ai/v1",
		currency: "USD",
		supportsAutoCredits: false,
		stripModelPrefix: true,
		systemKeyEnvVar: "XAI_KEY",
		mapModelId: (id) => {
			if (id.includes("-non-reasoning")) return `x-ai/${id}`;
			const cleaned = id
				.replace(/-reasoning$/, "")
				.replace(/-\d{4,8}$/, "")
				.replace(/^(grok-\d+)-(\d+)/, "$1.$2");
			return `x-ai/${cleaned}`;
		},
		credentialGuide: {
			placeholder: "xai-...",
			secretPattern: "^xai-[A-Za-z0-9]+$",
		},
	},
	{
		id: "keyaos",
		name: "Keyaos",
		logoUrl: "https://keyaos.com/favicon.ico",
		baseUrl: "https://keyaos.com/v1",
		currency: "USD",
		supportsAutoCredits: true,
		creditsUrl: "https://keyaos.com/v1/credits",
		parseCredits: parseKeyaosCredits,
		hidden: true,
		modelsUrl: "https://keyaos.com/api/catalog",
		parseModels: parseKeyaosCatalog,
		extraHeaders: { "X-Keyaos-Depth": "1" },
		credentialGuide: {
			placeholder: "sk-keyaos-...",
			secretPattern: "^sk-keyaos-[a-f0-9]{32}$",
		},
	},
];

// ─── Registry API ───────────────────────────────────────────

const adapters = new Map<string, ProviderAdapter>();

adapters.set("accio", accioAdapter);

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

/** Providers visible on public pages (excludes hidden providers like Keyaos). */
export function getVisibleProviders(): ProviderAdapter[] {
	return Array.from(adapters.values()).filter((p) => !p.info.hidden);
}

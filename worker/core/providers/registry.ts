/**
 * Provider registry
 *
 * Defines all supported upstream providers and their configurations.
 */
import type { ProviderAdapter, ProviderCredits } from "./interface";
import {
	OpenAICompatibleAdapter,
	type OpenAICompatibleConfig,
} from "./openai-compatible";

/** DeepSeek /user/balance response parser */
function parseDeepSeekCredits(
	json: Record<string, unknown>,
): ProviderCredits | null {
	const infos = json.balance_infos as
		| { currency: string; total_balance: string }[]
		| undefined;
	if (!infos?.[0]) return null;
	const balance = parseFloat(infos[0].total_balance);
	if (Number.isNaN(balance)) return null;
	return { remaining: balance, usage: null };
}

const PROVIDER_CONFIGS: OpenAICompatibleConfig[] = [
	{
		id: "openrouter",
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		currency: "USD",
		supportsAutoCredits: true,
		creditsUrl: "https://openrouter.ai/api/v1/credits",
		validationUrl: "https://openrouter.ai/api/v1/auth/key",
	},
	{
		id: "zenmux",
		name: "ZenMux",
		baseUrl: "https://zenmux.ai/api/v1",
		currency: "USD",
		supportsAutoCredits: false,
		validationUrl: "https://zenmux.ai/api/v1/generation?id=_validate",
	},
	{
		id: "deepinfra",
		name: "DeepInfra",
		baseUrl: "https://api.deepinfra.com/v1/openai",
		currency: "USD",
		supportsAutoCredits: false,
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		currency: "CNY",
		supportsAutoCredits: true,
		creditsUrl: "https://api.deepseek.com/user/balance",
		parseCredits: parseDeepSeekCredits,
	},
];

const adapters = new Map<string, ProviderAdapter>();
for (const config of PROVIDER_CONFIGS) {
	adapters.set(config.id, new OpenAICompatibleAdapter(config));
}

export function getProvider(id: string): ProviderAdapter | undefined {
	return adapters.get(id);
}

export function getAllProviders(): ProviderAdapter[] {
	return Array.from(adapters.values());
}

export function getProviderIds(): string[] {
	return Array.from(adapters.keys());
}

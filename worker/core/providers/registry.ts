/**
 * Provider registry
 *
 * Defines all supported upstream providers and their configurations.
 */
import type { ProviderAdapter } from "./interface";
import {
	OpenAICompatibleAdapter,
	type OpenAICompatibleConfig,
} from "./openai-compatible";

const PROVIDER_CONFIGS: OpenAICompatibleConfig[] = [
	{
		id: "openrouter",
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		supportsAutoCredits: true,
		creditsUrl: "https://openrouter.ai/api/v1/credits",
		validationUrl: "https://openrouter.ai/api/v1/auth/key",
	},
	{
		id: "zenmux",
		name: "ZenMux",
		baseUrl: "https://zenmux.ai/api/v1",
		supportsAutoCredits: false,
		validationUrl: "https://zenmux.ai/api/v1/generation?id=_validate",
	},
	{
		id: "deepinfra",
		name: "DeepInfra",
		baseUrl: "https://api.deepinfra.com/v1/openai",
		supportsAutoCredits: false,
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

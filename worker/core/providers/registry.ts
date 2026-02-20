/**
 * Provider registry
 *
 * Defines all supported upstream providers and their configurations.
 * All current providers are OpenAI-compatible, sharing the same adapter.
 */

import type { ProviderAdapter } from "./interface";
import {
	OpenAICompatibleAdapter,
	type OpenAICompatibleConfig,
} from "./openai-compatible";

/** Provider configurations — hardcoded endpoints for security */
const PROVIDER_CONFIGS: OpenAICompatibleConfig[] = [
	{
		id: "openrouter",
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		creditsPath: "/../credits", // /api/v1/../credits => /api/credits ... actually: /api/v1/credits doesn't exist
	},
	{
		id: "zenmux",
		name: "ZenMux",
		baseUrl: "https://zenmux.ai/api/v1",
	},
];

// Build adapter instances
const adapters = new Map<string, ProviderAdapter>();
for (const config of PROVIDER_CONFIGS) {
	adapters.set(config.id, new OpenAICompatibleAdapter(config));
}

/**
 * Get a provider adapter by its id.
 */
export function getProvider(id: string): ProviderAdapter | undefined {
	return adapters.get(id);
}

/**
 * Get all registered providers.
 */
export function getAllProviders(): ProviderAdapter[] {
	return Array.from(adapters.values());
}

/**
 * Get all provider ids.
 */
export function getProviderIds(): string[] {
	return Array.from(adapters.keys());
}

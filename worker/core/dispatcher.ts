/**
 * Dispatcher — Key selection and request routing
 *
 * Given a model name, determines the provider and selects the best key.
 * For now, model names follow the "provider/model" format (e.g. "openai/gpt-4o").
 */

import { BadRequestError, NoKeyAvailableError } from "../shared/errors";
import { keyPool, type PoolKey } from "./key-pool";
import type { ProviderAdapter } from "./providers/interface";
import { getProvider, getProviderIds } from "./providers/registry";

export interface DispatchResult {
	key: PoolKey;
	provider: ProviderAdapter;
	/** The model name to send to the upstream (may differ from user input) */
	upstreamModel: string;
}

/**
 * Parse a model string to extract provider and model name.
 *
 * Supported formats:
 * - "<provider>/<model-name>" → explicit provider (e.g. "openrouter/openai/gpt-4o")
 * - "<model-name>" → try all providers
 */
function parseModel(model: string): {
	provider: string | null;
	model: string;
} {
	const slashIndex = model.indexOf("/");
	if (slashIndex > 0) {
		const prefix = model.substring(0, slashIndex);
		if (getProviderIds().includes(prefix)) {
			return {
				provider: prefix,
				model: model.substring(slashIndex + 1),
			};
		}
	}
	return { provider: null, model };
}

/**
 * Dispatch a request: select the best key and provider for the given model.
 */
export function dispatch(model: string): DispatchResult {
	if (!model) {
		throw new BadRequestError("Model is required");
	}

	const parsed = parseModel(model);

	// If provider is explicit, try that provider first
	if (parsed.provider) {
		const key = keyPool.selectKey(parsed.provider, parsed.model);
		if (key) {
			const provider = getProvider(parsed.provider);
			if (provider) {
				return {
					key,
					provider,
					upstreamModel: parsed.model,
				};
			}
		}
	} else {
		// No explicit provider, try all providers
		for (const providerId of getProviderIds()) {
			const key = keyPool.selectKey(providerId, parsed.model);
			if (key) {
				const provider = getProvider(providerId);
				if (provider) {
					return {
						key,
						provider,
						upstreamModel: parsed.model,
					};
				}
			}
		}
	}

	throw new NoKeyAvailableError(model);
}

/**
 * Provider adapter interface and types
 *
 * All providers that are OpenAI-compatible (OpenRouter, ZenMux, etc.)
 * share the same adapter. Only the base URL and credit-check endpoint differ.
 */

export interface ProviderCredentials {
	apiKey: string;
	baseUrl: string;
}

export interface ProviderInfo {
	/** Unique provider id, e.g. "openrouter", "zenmux" */
	id: string;
	/** Display name */
	name: string;
	/** Fixed API base URL */
	baseUrl: string;
	/** Whether this provider uses OpenAI-compatible API format */
	openaiCompatible: boolean;
}

export interface KeyBalance {
	/** Remaining balance in USD (null if not queryable) */
	remainingUsd: number | null;
	/** Total balance in USD (null if not queryable) */
	totalUsd: number | null;
}

export interface ProviderAdapter {
	/** Provider metadata */
	info: ProviderInfo;

	/**
	 * Validate that an API key is working.
	 * Returns true if the key is valid and has remaining balance.
	 */
	validateKey(apiKey: string): Promise<boolean>;

	/**
	 * Check remaining balance for a key.
	 * Returns null if the provider doesn't support balance queries.
	 */
	checkBalance(apiKey: string): Promise<KeyBalance | null>;

	/**
	 * Forward a chat completion request to the upstream provider.
	 * Returns the raw Response from fetch (supports streaming).
	 */
	forwardRequest(
		apiKey: string,
		request: Request,
		body: Record<string, unknown>,
	): Promise<Response>;

	/**
	 * Get the list of available models from this provider.
	 */
	listModels(apiKey: string): Promise<unknown>;
}

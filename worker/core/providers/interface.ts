/**
 * Provider adapter interface and types
 *
 * All providers are OpenAI-compatible. Only the base URL
 * and credit-check endpoint differ.
 */

export interface ProviderInfo {
	/** Unique provider id, e.g. "openrouter", "zenmux" */
	id: string;
	/** Display name */
	name: string;
	/** Fixed API base URL */
	baseUrl: string;
}

export interface KeyBalance {
	/** Remaining balance in USD (null if not queryable) */
	remainingUsd: number | null;
	/** Total balance in USD (null if not queryable) */
	totalUsd: number | null;
}

export interface ProviderAdapter {
	info: ProviderInfo;

	/** Validate that an API key is working */
	validateKey(apiKey: string): Promise<boolean>;

	/** Check remaining balance for a key (null if unsupported) */
	checkBalance(apiKey: string): Promise<KeyBalance | null>;

	/** Forward a chat completion request to the upstream provider */
	forwardRequest(
		apiKey: string,
		request: Request,
		body: Record<string, unknown>,
	): Promise<Response>;
}

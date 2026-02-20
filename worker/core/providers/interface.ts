/**
 * Provider adapter interface
 *
 * All providers are OpenAI-compatible. Only the base URL,
 * credit-check endpoint, and response parsing differ.
 */

export interface ProviderInfo {
	id: string;
	name: string;
	baseUrl: string;
	/** Whether this provider supports automatic credit fetching */
	supportsAutoCredits: boolean;
}

/** Credits info fetched from upstream provider */
export interface ProviderCredits {
	/** Remaining credits in USD (null if unknown) */
	remainingUsd: number | null;
	/** Total usage in USD (null if unknown) */
	usageUsd: number | null;
}

export interface ProviderAdapter {
	info: ProviderInfo;

	/** Validate that an API key is working */
	validateKey(apiKey: string): Promise<boolean>;

	/** Fetch credits/usage info for a key (null if unsupported) */
	fetchCredits(apiKey: string): Promise<ProviderCredits | null>;

	/** Forward a chat completion request to the upstream provider */
	forwardRequest(
		apiKey: string,
		request: Request,
		body: Record<string, unknown>,
	): Promise<Response>;
}

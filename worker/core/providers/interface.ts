/**
 * Provider adapter interface
 *
 * All providers are OpenAI-compatible. Only the base URL,
 * credit-check endpoint, and response parsing differ.
 */

import type { DbMarketQuote } from "../db/schema";

export interface ProviderInfo {
	id: string;
	name: string;
	/** Whether this provider supports automatic credit fetching */
	supportsAutoCredits: boolean;
	/** Native currency of this provider's balance/pricing */
	currency: "USD" | "CNY";
}

/** Credits info fetched from upstream provider (in provider's native currency) */
export interface ProviderCredits {
	/** Remaining credits (null if unknown) */
	remaining: number | null;
	/** Total usage (null if unknown) */
	usage: number | null;
}

export type ParsedModel = Omit<DbMarketQuote, "refreshed_at">;

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

	/**
	 * Fetch and parse models from upstream.
	 * Returns parsed models with pricing in USD cents/M tokens.
	 * @param cnyUsdRate - exchange rate for CNY providers
	 */
	fetchModels(cnyUsdRate?: number): Promise<ParsedModel[]>;
}

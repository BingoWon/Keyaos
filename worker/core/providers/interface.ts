import type { DbModelPricing } from "../db/schema";

export interface ProviderInfo {
	id: string;
	name: string;
	supportsAutoCredits: boolean;
	currency: "USD" | "CNY";
	authType?: "api_key" | "oauth";
}

export interface ProviderCredits {
	remaining: number | null;
	usage: number | null;
}

export type ParsedModel = Omit<DbModelPricing, "refreshed_at">;

export interface ProviderAdapter {
	info: ProviderInfo;

	/** Normalize raw user input into the canonical secret for storage. Throws on invalid input. */
	normalizeSecret?(raw: string): string;

	validateKey(secret: string): Promise<boolean>;

	fetchCredits(secret: string): Promise<ProviderCredits | null>;

	forwardRequest(
		secret: string,
		body: Record<string, unknown>,
	): Promise<Response>;

	fetchModels(cnyUsdRate?: number): Promise<ParsedModel[]>;
}

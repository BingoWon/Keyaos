import type { DbModelPricing } from "../db/schema";

export interface ProviderInfo {
	id: string;
	name: string;
	supportsAutoCredits: boolean;
	currency: "USD" | "CNY";
}

export interface ProviderCredits {
	remaining: number | null;
	usage: number | null;
}

export type ParsedModel = Omit<DbModelPricing, "refreshed_at">;

export interface ProviderAdapter {
	info: ProviderInfo;

	validateKey(apiKey: string): Promise<boolean>;

	fetchCredits(apiKey: string): Promise<ProviderCredits | null>;

	forwardRequest(
		apiKey: string,
		body: Record<string, unknown>,
	): Promise<Response>;

	fetchModels(cnyUsdRate?: number): Promise<ParsedModel[]>;
}

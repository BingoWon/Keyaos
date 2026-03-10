import type { DbModelPricing } from "../db/schema";

export interface CredentialGuide {
	placeholder: string;
	secretPattern?: string;
	filePath?: string;
	command?: string | string[];
}

export interface ProviderInfo {
	id: string;
	name: string;
	logoUrl: string;
	supportsAutoCredits: boolean;
	currency: "USD" | "CNY";
	authType?: "api_key" | "oauth";
	isSubscription?: boolean;
	credentialGuide?: CredentialGuide;
}

export interface ProviderCredits {
	remaining: number | null;
	usage: number | null;
}

export type ParsedModel = Omit<DbModelPricing, "refreshed_at" | "is_active">;

export interface ProviderAdapter {
	info: ProviderInfo;

	/** Env var name for the system-level API key used in dynamic model sync. */
	systemKeyEnvVar?: string;

	/** Normalize raw user input into the canonical secret for storage. Throws on invalid input. */
	normalizeSecret?(raw: string): string;

	validateKey(secret: string): Promise<boolean>;

	fetchCredits(secret: string): Promise<ProviderCredits | null>;

	forwardRequest(
		secret: string,
		body: Record<string, unknown>,
	): Promise<Response>;

	forwardEmbedding?(
		secret: string,
		body: Record<string, unknown>,
	): Promise<Response>;

	/** Fetch provider models. When systemKey is provided, prefer dynamic API fetch over static JSON. */
	fetchModels(cnyUsdRate?: number, systemKey?: string): Promise<ParsedModel[]>;
}

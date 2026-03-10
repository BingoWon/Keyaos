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

/** Shared shape for all models/*.json entries. */
export interface StaticModelEntry {
	id: string;
	name: string;
	input_usd: number;
	output_usd: number;
	context_length: number;
	upstream_model_id?: string;
}

/** Convert a static JSON model list into ParsedModel[]. */
export function parseStaticModels(
	provider: string,
	models: StaticModelEntry[],
): ParsedModel[] {
	const now = Date.now();
	return models.map((m) => ({
		id: `${provider}:${m.id}`,
		provider_id: provider,
		model_id: m.id,
		name: m.name,
		model_type: "chat" as const,
		input_price: m.input_usd,
		output_price: m.output_usd,
		context_length: m.context_length,
		input_modalities: null,
		output_modalities: null,
		upstream_model_id: m.upstream_model_id ?? null,
		metadata: null,
		created: now,
	}));
}

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

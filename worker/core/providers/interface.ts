import type { DbModelCatalog } from "../db/schema";

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
	/** Hidden providers are excluded from public pages but available in BYOK. */
	hidden?: boolean;
	credentialGuide?: CredentialGuide;
}

export interface ProviderCredits {
	remaining: number | null;
	usage: number | null;
}

export type ParsedModel = Omit<DbModelCatalog, "refreshed_at" | "is_active">;

/** Static model entry — ID-only, pricing enriched from OpenRouter canonical catalog. */
export interface StaticModelEntry {
	id: string;
	upstream_model_id?: string;
}

/** Convert a static JSON model list into ParsedModel[] with sentinel pricing (-1). */
export function parseStaticModels(
	provider: string,
	models: StaticModelEntry[],
): ParsedModel[] {
	const now = Date.now();
	return models.map((m) => ({
		id: `${provider}:${m.id}`,
		provider_id: provider,
		model_id: m.id,
		name: null,
		model_type: "chat" as const,
		input_price: -1,
		output_price: -1,
		context_length: null,
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

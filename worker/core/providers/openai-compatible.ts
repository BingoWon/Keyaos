/**
 * OpenAI-compatible provider adapter
 *
 * Shared by all providers. Each instance differs only in config.
 * Config is the SINGLE SOURCE OF TRUTH for all provider-specific behavior.
 */
import type {
	ParsedModel,
	ProviderAdapter,
	ProviderCredits,
	ProviderInfo,
} from "./interface";

export interface OpenAICompatibleConfig {
	id: string;
	name: string;
	baseUrl: string;
	/** Whether this provider supports automatic credit fetching */
	supportsAutoCredits: boolean;
	/** Native currency */
	currency: "USD" | "CNY";
	/** URL for credits/usage query (absolute) */
	creditsUrl?: string;
	/** URL for key validation (must return 401 for invalid keys) */
	validationUrl?: string;
	/** URL for models list (defaults to baseUrl + /models) */
	modelsUrl?: string;
	/** Custom credits response parser */
	parseCredits?: (json: Record<string, unknown>) => ProviderCredits | null;
	/** Custom models response parser (raw JSON → ParsedModel[]) */
	parseModels?: (
		raw: Record<string, unknown>,
		cnyUsdRate: number,
	) => ParsedModel[];
	/** Custom headers for all requests */
	extraHeaders?: Record<string, string>;
}

/** USD dollars → integer cents per 1M tokens */
const dollarsToCentsPerM = (usd: number): number => Math.round(usd * 100);

/**
 * Default models parser — handles OpenAI-standard /models response.
 * Providers with non-standard pricing formats override via parseModels config.
 */
function defaultParseModels(
	raw: Record<string, unknown>,
	providerId: string,
): ParsedModel[] {
	const data = raw.data as Record<string, unknown>[] | undefined;
	if (!data) return [];
	return data
		.filter((m) => m.id)
		.map((m) => ({
			id: `${providerId}:${m.id}`,
			provider: providerId,
			upstream_id: m.id as string,
			display_name: (m.name as string) || null,
			input_price: 0,
			output_price: 0,
			context_length: (m.context_length as number) || null,
			is_active: 1,
		}));
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
	info: ProviderInfo;

	constructor(private config: OpenAICompatibleConfig) {
		this.info = {
			id: config.id,
			name: config.name,
			supportsAutoCredits: config.supportsAutoCredits,
			currency: config.currency,
		};
	}

	async validateKey(apiKey: string): Promise<boolean> {
		try {
			const url = this.config.validationUrl || `${this.config.baseUrl}/models`;
			const res = await fetch(url, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
					...this.config.extraHeaders,
				},
			});
			return res.status !== 401;
		} catch {
			return false;
		}
	}

	async fetchCredits(apiKey: string): Promise<ProviderCredits | null> {
		if (!this.config.creditsUrl) return null;

		try {
			const res = await fetch(this.config.creditsUrl, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
					...this.config.extraHeaders,
				},
			});

			if (!res.ok) return null;
			const json = (await res.json()) as Record<string, unknown>;

			if (this.config.parseCredits) {
				return this.config.parseCredits(json);
			}

			// Default: OpenRouter /credits format { data: { total_credits, total_usage } }
			if (json.data && typeof json.data === "object") {
				const d = json.data as Record<string, number | null>;
				if (d.total_credits != null) {
					const remaining = (d.total_credits ?? 0) - (d.total_usage ?? 0);
					return {
						remaining: Math.max(remaining, 0),
						usage: d.total_usage ?? null,
					};
				}
			}
			return null;
		} catch {
			return null;
		}
	}

	async fetchModels(cnyUsdRate = 7): Promise<ParsedModel[]> {
		const url = this.config.modelsUrl || `${this.config.baseUrl}/models`;

		try {
			const res = await fetch(url);
			if (!res.ok) return [];
			const raw = (await res.json()) as Record<string, unknown>;

			if (this.config.parseModels) {
				return this.config.parseModels(raw, cnyUsdRate);
			}
			return defaultParseModels(raw, this.config.id);
		} catch {
			return [];
		}
	}

	async forwardRequest(
		apiKey: string,
		_request: Request,
		body: Record<string, unknown>,
	): Promise<Response> {
		const upstreamResponse = await fetch(
			`${this.config.baseUrl}/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
					...this.config.extraHeaders,
				},
				body: JSON.stringify(body),
			},
		);

		const headers = new Headers();
		const skipHeaders = new Set([
			"connection",
			"keep-alive",
			"transfer-encoding",
		]);
		upstreamResponse.headers.forEach((value, key) => {
			if (!skipHeaders.has(key.toLowerCase())) {
				headers.set(key, value);
			}
		});

		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers,
		});
	}
}

// ─── Reusable parser helpers (used in registry.ts parseModels configs) ──

export { dollarsToCentsPerM };

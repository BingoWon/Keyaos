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
	supportsAutoCredits: boolean;
	currency: "USD" | "CNY";
	creditsUrl?: string;
	validationUrl?: string;
	modelsUrl?: string;
	parseCredits?: (json: Record<string, unknown>) => ProviderCredits | null;
	parseModels?: (
		raw: Record<string, unknown>,
		cnyUsdRate: number,
	) => ParsedModel[];
	extraHeaders?: Record<string, string>;
}

/** USD dollars → integer cents per 1M tokens */
export const dollarsToCentsPerM = (usd: number): number =>
	Math.round(usd * 100);

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

	async validateKey(secret: string): Promise<boolean> {
		try {
			const url = this.config.validationUrl || `${this.config.baseUrl}/models`;
			const res = await fetch(url, {
				headers: {
					Authorization: `Bearer ${secret}`,
					...this.config.extraHeaders,
				},
			});
			return res.status !== 401;
		} catch {
			return false;
		}
	}

	async fetchCredits(secret: string): Promise<ProviderCredits | null> {
		if (!this.config.creditsUrl) return null;

		try {
			const res = await fetch(this.config.creditsUrl, {
				headers: {
					Authorization: `Bearer ${secret}`,
					...this.config.extraHeaders,
				},
			});

			if (!res.ok) return null;
			const json = (await res.json()) as Record<string, unknown>;

			if (this.config.parseCredits) {
				return this.config.parseCredits(json);
			}

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
		secret: string,
		body: Record<string, unknown>,
	): Promise<Response> {
		const upstreamResponse = await fetch(
			`${this.config.baseUrl}/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${secret}`,
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

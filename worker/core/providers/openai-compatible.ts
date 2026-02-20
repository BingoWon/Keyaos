/**
 * OpenAI-compatible provider adapter
 *
 * Shared by all providers. Each instance differs in baseUrl,
 * credits endpoint, and response parsing.
 */
import type {
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
	/** Absolute URL for credits/usage query (not relative to baseUrl) */
	creditsUrl?: string;
	/** Custom headers to add to all requests */
	extraHeaders?: Record<string, string>;
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
	info: ProviderInfo;

	constructor(private config: OpenAICompatibleConfig) {
		this.info = {
			id: config.id,
			name: config.name,
			baseUrl: config.baseUrl,
			supportsAutoCredits: config.supportsAutoCredits,
		};
	}

	async validateKey(apiKey: string): Promise<boolean> {
		try {
			const res = await fetch(`${this.config.baseUrl}/models`, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
					...this.config.extraHeaders,
				},
			});
			return res.ok;
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

			// OpenRouter: GET /api/v1/auth/key
			// Returns { data: { usage, limit, limit_remaining } }
			if (json.data && typeof json.data === "object") {
				const d = json.data as Record<string, number | null>;
				return {
					remainingUsd: d.limit_remaining ?? null,
					usageUsd: d.usage ?? null,
				};
			}

			return null;
		} catch {
			return null;
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

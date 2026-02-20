/**
 * OpenAI-compatible provider adapter
 *
 * Shared by all providers. Each instance differs only in
 * baseUrl and optional features like balance checking.
 */
import type { KeyBalance, ProviderAdapter, ProviderInfo } from "./interface";

export interface OpenAICompatibleConfig {
	id: string;
	name: string;
	baseUrl: string;
	/** Path to check credits/balance, relative to baseUrl */
	creditsPath?: string;
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

	async checkBalance(apiKey: string): Promise<KeyBalance | null> {
		if (!this.config.creditsPath) return null;

		try {
			const res = await fetch(
				`${this.config.baseUrl}${this.config.creditsPath}`,
				{
					headers: {
						Authorization: `Bearer ${apiKey}`,
						...this.config.extraHeaders,
					},
				},
			);

			if (!res.ok) return null;

			const data = (await res.json()) as Record<string, unknown>;

			// OpenRouter format: { data: { total_credits, total_usage } }
			if (data.data && typeof data.data === "object") {
				const d = data.data as Record<string, number>;
				return {
					totalUsd: d.total_credits ?? null,
					remainingUsd:
						d.total_credits != null && d.total_usage != null
							? d.total_credits - d.total_usage
							: null,
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

		// Transparent proxy: strip hop-by-hop headers
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

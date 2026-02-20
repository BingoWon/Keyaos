/**
 * OpenAI-compatible provider adapter
 *
 * Shared by OpenRouter, ZenMux, and any other provider that
 * implements the OpenAI /v1/chat/completions API format.
 *
 * Each provider instance differs only in baseUrl and optional
 * features like balance checking.
 */

import type { KeyBalance, ProviderAdapter, ProviderInfo } from "./interface";

export interface OpenAICompatibleConfig {
	id: string;
	name: string;
	baseUrl: string;
	/** Path to check credits/balance, relative to baseUrl. Null if not supported. */
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
			openaiCompatible: true,
		};
	}

	async validateKey(apiKey: string): Promise<boolean> {
		try {
			const url = `${this.config.baseUrl}/models`;
			const res = await fetch(url, {
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
			const url = `${this.config.baseUrl}${this.config.creditsPath}`;
			const res = await fetch(url, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
					...this.config.extraHeaders,
				},
			});

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
		const url = `${this.config.baseUrl}/chat/completions`;

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
			...this.config.extraHeaders,
		};

		const upstreamResponse = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});

		// Transparent proxy: return the response as-is
		// Clone headers from upstream
		const responseHeaders = new Headers();
		upstreamResponse.headers.forEach((value, key) => {
			// Skip hop-by-hop headers
			if (
				!["connection", "keep-alive", "transfer-encoding"].includes(
					key.toLowerCase(),
				)
			) {
				responseHeaders.set(key, value);
			}
		});

		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: responseHeaders,
		});
	}

	async listModels(apiKey: string): Promise<unknown> {
		const url = `${this.config.baseUrl}/models`;
		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				...this.config.extraHeaders,
			},
		});

		if (!res.ok) {
			throw new Error(
				`Failed to list models from ${this.info.name}: ${res.status}`,
			);
		}

		return res.json();
	}
}

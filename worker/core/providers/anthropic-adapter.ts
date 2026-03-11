/**
 * Anthropic Native Adapter
 *
 * Non-OpenAI-compatible provider: requires protocol conversion.
 * Auth: X-Api-Key header + anthropic-version header.
 * Chat: POST /v1/messages (Anthropic Messages API).
 * Models: dynamic fetch via system key; static JSON when no key is configured.
 */

import {
	createAnthropicNativeToOpenAIStream,
	fromAnthropicNativeResponse,
	toAnthropicNativeRequest,
} from "../protocols/anthropic";
import type {
	ParsedModel,
	ProviderAdapter,
	ProviderCredits,
	ProviderInfo,
} from "./interface";

const BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

/** Convert Anthropic native ID to OpenRouter canonical: strip date, `d-d` → `d.d`, add prefix. */
function toCanonicalId(nativeId: string): string {
	const stripped = nativeId.replace(/-\d{8}$/, "");
	const dotted = stripped.replace(/(\d+)-(\d+)$/, "$1.$2");
	return `anthropic/${dotted}`;
}

class AnthropicAdapter implements ProviderAdapter {
	info: ProviderInfo = {
		id: "anthropic",
		name: "Anthropic",
		logoUrl: "https://anthropic.com/favicon.ico",
		supportsAutoCredits: false,
		currency: "USD",
		credentialGuide: {
			placeholder: "sk-ant-api03-...",
			secretPattern: "^sk-ant-api\\d+-[A-Za-z0-9_-]+$",
		},
	};

	systemKeyEnvVar = "ANTHROPIC_KEY";

	async validateKey(secret: string): Promise<boolean> {
		try {
			const res = await fetch(`${BASE_URL}/models?limit=1`, {
				headers: {
					"X-Api-Key": secret,
					"anthropic-version": ANTHROPIC_VERSION,
				},
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	async fetchCredits(_secret: string): Promise<ProviderCredits | null> {
		return null;
	}

	async forwardRequest(
		secret: string,
		body: Record<string, unknown>,
	): Promise<Response> {
		const streaming = body.stream === true;
		const anthropicBody = toAnthropicNativeRequest(body);

		const upstreamResponse = await fetch(`${BASE_URL}/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Api-Key": secret,
				"anthropic-version": ANTHROPIC_VERSION,
			},
			body: JSON.stringify(anthropicBody),
		});

		if (!upstreamResponse.ok) {
			return new Response(upstreamResponse.body, {
				status: upstreamResponse.status,
				headers: { "Content-Type": "application/json" },
			});
		}

		if (streaming && upstreamResponse.body) {
			const model = (body.model as string) || "claude";
			return new Response(
				upstreamResponse.body.pipeThrough(
					createAnthropicNativeToOpenAIStream(model),
				),
				{
					status: 200,
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
					},
				},
			);
		}

		const json = (await upstreamResponse.json()) as Record<string, unknown>;
		return new Response(JSON.stringify(fromAnthropicNativeResponse(json)), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	async fetchModels(
		_cnyUsdRate?: number,
		systemKey?: string,
	): Promise<ParsedModel[]> {
		if (systemKey) return this.dynamicFetchModels(systemKey);
		return [];
	}

	private async dynamicFetchModels(systemKey: string): Promise<ParsedModel[]> {
		try {
			const res = await fetch(`${BASE_URL}/models?limit=100`, {
				headers: {
					"X-Api-Key": systemKey,
					"anthropic-version": ANTHROPIC_VERSION,
				},
			});
			if (!res.ok) return [];
			const json = (await res.json()) as {
				data: { id: string; display_name: string }[];
			};

			const now = Date.now();
			return json.data.map((m) => {
				const canonicalId = toCanonicalId(m.id);
				return {
					id: `anthropic:${canonicalId}`,
					provider_id: "anthropic",
					model_id: canonicalId,
					name: m.display_name || null,
					model_type: "chat" as const,
					input_price: -1,
					output_price: -1,
					context_length: null,
					input_modalities: null,
					output_modalities: null,
					upstream_model_id: m.id,
					metadata: null,
					created: now,
				};
			});
		} catch {
			return [];
		}
	}
}

export const anthropicAdapter = new AnthropicAdapter();

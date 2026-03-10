/**
 * Anthropic Native Adapter
 *
 * Non-OpenAI-compatible provider: requires protocol conversion.
 * Auth: X-Api-Key header + anthropic-version header.
 * Chat: POST /v1/messages (Anthropic Messages API).
 * Models: static JSON (API returns dated IDs, we map to OpenRouter canonical).
 */

import anthropicModels from "../models/anthropic.json";
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

interface ModelEntry {
	id: string;
	name: string;
	input_usd: number;
	output_usd: number;
	context_length: number;
	upstream_model_id?: string;
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

	async fetchModels(_cnyUsdRate?: number): Promise<ParsedModel[]> {
		return (anthropicModels as ModelEntry[]).map((m) => ({
			id: `anthropic:${m.id}`,
			provider_id: "anthropic",
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
			created: Date.now(),
		}));
	}
}

export const anthropicAdapter = new AnthropicAdapter();

/**
 * Accio Adapter — Alibaba Phoenix AI Agent Desktop
 *
 * Auth: accessToken from phoenix_cookie (long-lived, ~30 days).
 * Protocol: Custom Gemini-style proto via phoenix-gw.alibaba.com gateway.
 * No client_id/client_secret needed — user provides accessToken directly.
 */

import {
	ACCIO_MODEL_MAP,
	createAccioToOpenAIStream,
	toAccioRequest,
	toOpenAIResponse,
} from "../protocols/accio";
import { parseSSEDataLine } from "../protocols/shared";
import {
	type ParsedModel,
	type ProviderAdapter,
	type ProviderCredits,
	type ProviderInfo,
	parseStaticModels,
} from "./interface";

// ─── Constants ──────────────────────────────────────────

const GATEWAY_BASE = "https://phoenix-gw.alibaba.com/api";
const API_URL = `${GATEWAY_BASE}/adk/llm/generateContent`;
const CONFIG_URL = `${GATEWAY_BASE}/llm/config`;

// ─── Model Mapping ──────────────────────────────────────

function mapAccioModelId(adkModelName: string): string | null {
	return ACCIO_MODEL_MAP[adkModelName] ?? null;
}

// ─── Adapter ────────────────────────────────────────────

export class AccioAdapter implements ProviderAdapter {
	systemKeyEnvVar = "ACCIO_KEY";
	info: ProviderInfo = {
		id: "accio",
		name: "Accio",
		logoUrl: "https://keyaos.com/accio-favicon.png",
		supportsAutoCredits: false,
		currency: "USD",
		authType: "oauth",
		isSubscription: true,
		credentialGuide: {
			placeholder: "accessToken=... or full phoenix_cookie string",
		},
	};

	// ─── ProviderAdapter interface ──────────────────────

	normalizeSecret(raw: string): string {
		let trimmed = raw.trim();

		// Handle full cookie string: extract accessToken from phoenix_cookie
		if (trimmed.includes("phoenix_cookie=")) {
			const match = trimmed.match(/phoenix_cookie=.*?accessToken=([^&;\s]+)/);
			if (match?.[1]) return match[1];
		}

		// Handle phoenix_cookie value: accessToken=xxx&refreshToken=xxx&expiresAt=xxx
		if (trimmed.includes("accessToken=")) {
			const match = trimmed.match(/accessToken=([^&;\s]+)/);
			if (match?.[1]) return match[1];
		}

		// Handle JSON input
		if (trimmed.startsWith("{")) {
			let parsed: Record<string, unknown>;
			try {
				const lastBrace = trimmed.lastIndexOf("}");
				if (lastBrace !== -1) trimmed = trimmed.slice(0, lastBrace + 1);
				parsed = JSON.parse(trimmed);
			} catch {
				throw new Error(
					"Invalid JSON. Paste the phoenix_cookie value or just the refreshToken.",
				);
			}

			const at =
				(parsed.accessToken as string) ?? (parsed.access_token as string);
			if (at) return at;

			throw new Error(
				'JSON does not contain an "accessToken" field. Check the phoenix_cookie.',
			);
		}

		// Raw token value
		return trimmed;
	}

	async validateKey(secret: string): Promise<boolean> {
		try {
			const res = await fetch(API_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "text/event-stream",
				},
				body: JSON.stringify({
					model: "gemini-3-flash-preview",
					token: secret,
					empid: "",
					tenant: "",
					iai_tag: "",
					request_id: `validate-${Date.now()}`,
					contents: [
						{
							role: "user",
							parts: [{ text: "." }],
						},
					],
					max_output_tokens: 1,
					timeout: 15,
					include_thoughts: false,
					stop_sequences: [],
					properties: {},
				}),
			});
			if (!res.ok) return false;
			// Gateway always returns 200 — check SSE body for auth errors
			const body = await res.text();
			return !body.includes('"error_code"');
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
		const accioBody = toAccioRequest(body, secret);

		const upstream = await fetch(API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "text/event-stream",
			},
			body: JSON.stringify(accioBody),
		});

		if (!upstream.ok) {
			const errText = await upstream.text();
			return new Response(
				JSON.stringify({
					error: {
						message: errText || `Accio upstream error: ${upstream.status}`,
						type: "api_error",
					},
				}),
				{
					status: upstream.status,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const model = body.model as string;

		if (streaming) {
			if (!upstream.body) return new Response("", { status: 502 });

			return new Response(
				upstream.body.pipeThrough(createAccioToOpenAIStream(model)),
				{
					status: 200,
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
					},
				},
			);
		}

		// Non-streaming: collect all SSE frames, then convert to single response
		const text = await upstream.text();
		const frames: Record<string, unknown>[] = [];

		for (const block of text.split("\n\n")) {
			for (const line of block.split("\n")) {
				const dataStr = parseSSEDataLine(line);
				if (dataStr === null) continue;
				try {
					frames.push(JSON.parse(dataStr));
				} catch {}
			}
		}

		return new Response(JSON.stringify(toOpenAIResponse(frames, model)), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	async fetchModels(
		_cnyUsdRate?: number,
		secret?: string,
	): Promise<ParsedModel[]> {
		if (secret) {
			try {
				const res = await fetch(CONFIG_URL, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
					body: JSON.stringify({ token: secret }),
				});

				if (res.ok) {
					const data = (await res.json()) as {
						data: { modelList: { modelName: string; visible: boolean }[] }[];
					};

					const models: { id: string }[] = [];
					for (const provider of data.data || []) {
						for (const model of provider.modelList || []) {
							if (model.visible) {
								const mapped = mapAccioModelId(model.modelName);
								if (mapped) models.push({ id: mapped });
							}
						}
					}

					return parseStaticModels("accio", models);
				}
			} catch {
				// No token or fetch failed — return empty so sync skips gracefully
			}
		}

		return [];
	}
}

export const accioAdapter = new AccioAdapter();

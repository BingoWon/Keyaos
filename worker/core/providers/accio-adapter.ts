/**
 * Accio Adapter — Alibaba Phoenix AI Agent Desktop
 *
 * Auth: accessToken from phoenix_cookie (long-lived, ~30 days).
 * Protocol: Custom Gemini-style proto via phoenix-gw.alibaba.com gateway.
 * No client_id/client_secret needed — user provides accessToken directly.
 */

import {
	createAccioToOpenAIStream,
	toAccioRequest,
	toOpenAIResponse,
} from "../protocols/accio";
import {
	type ParsedModel,
	type ProviderAdapter,
	type ProviderCredits,
	type ProviderInfo,
	parseStaticModels,
} from "./interface";

// ─── Constants ──────────────────────────────────────────

const GATEWAY_BASE = "https://phoenix-gw.alibaba.com/api";
const LLM_BASE = `${GATEWAY_BASE}/adk/llm`;
const API_URL = `${LLM_BASE}/generateContent`;
const CONFIG_URL = `${GATEWAY_BASE}/llm/config`;

// ─── Model Mapping ──────────────────────────────────────

function mapAccioModelId(adkModelName: string): string | null {
	const m = adkModelName.toLowerCase();

	// Anthropic
	if (m === "claude-sonnet-4-6") return "anthropic/claude-sonnet-4.6";
	if (m === "claude-opus-4-6") return "anthropic/claude-opus-4.6";
	if (m === "claude-sonnet-4-20250514") return "anthropic/claude-sonnet-4-20250514";

	// Google
	if (m === "gemini-3.1-flash-image-preview") return "google/gemini-3.1-flash-image";
	if (m === "gemini-3-flash-preview") return "google/gemini-3-flash-preview";
	if (m === "gemini-3.1-pro-preview") return "google/gemini-3.1-pro-preview";
	if (m === "gemini-3-pro-image-preview") return "google/gemini-3-pro-image";
	if (m === "gemini-3-pro-preview") return "google/gemini-3-pro-preview";
	if (m === "gemini-2.5-flash") return "google/gemini-2.5-flash";
	if (m === "gemini-2.5-pro") return "google/gemini-2.5-pro";

	// OpenAI
	if (m === "gpt-5.4") return "openai/gpt-5.4";
	if (m === "gpt-5.2-1211") return "openai/gpt-5.2-1211";
	if (m === "gpt-4o") return "openai/gpt-4o";
	if (m === "gpt-4o-mini") return "openai/gpt-4o-mini";
	if (m === "gpt-4-turbo") return "openai/gpt-4-turbo";
	if (m === "gpt-5-preview") return "openai/gpt-5-preview";

	// Qwen
	if (m === "qwen3-max-2026-01-23" || m === "qwen3-max") return "qwen/qwen3-max";

	// Others
	if (m === "kimi-k2.5") return "moonshot/kimi-k2.5";
	if (m === "glm-5") return "zhipu/glm-5";
	if (m === "minimax-m2.5") return "minimax/minimax-m2.5";

	return null;
}

// ─── Adapter ────────────────────────────────────────────

export class AccioAdapter implements ProviderAdapter {
	info: ProviderInfo = {
		id: "accio",
		name: "Accio",
		logoUrl:
			"https://sc02.alicdn.com/kf/A01fa5c73064d4f3abedffcec8af79b6fB.png",
		supportsAutoCredits: false,
		currency: "USD",
		authType: "oauth",
		isSubscription: true,
		credentialGuide: {
			placeholder: "accessToken=... or full phoenix_cookie string",
			filePath: "Browser DevTools → Application → Cookies → phoenix_cookie",
			command: [
				"1. Open Accio desktop app and let it log in",
				"2. In browser, visit accio.com → F12 → Application → Cookies",
				"3. Find phoenix_cookie, extract the refreshToken value",
			],
		},
	};

	// ─── ProviderAdapter interface ──────────────────────

	normalizeSecret(raw: string): string {
		let trimmed = raw.trim();

		// Handle full cookie string: extract accessToken from phoenix_cookie
		if (trimmed.includes("phoenix_cookie=")) {
			const match = trimmed.match(
				/phoenix_cookie=.*?accessToken=([^&;\s]+)/,
			);
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
				(parsed.accessToken as string) ??
				(parsed.access_token as string);
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
							parts: [{ text: ".", thought: false }],
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
						message:
							errText ||
							`Accio upstream error: ${upstream.status}`,
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
				const trimmed = line.trim();
				if (!trimmed.startsWith("data:")) continue;
				const dataStr = trimmed.startsWith("data: ")
					? trimmed.substring(6)
					: trimmed.substring(5);
				if (dataStr === "[DONE]") continue;
				try {
					frames.push(JSON.parse(dataStr));
				} catch {}
			}
		}

		return new Response(
			JSON.stringify(toOpenAIResponse(frames, model)),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
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
				// Fall back to static config
			}
		}

		return parseStaticModels("accio", [
			{ id: "anthropic/claude-sonnet-4.6" },
			{ id: "anthropic/claude-opus-4.6" },
			{ id: "google/gemini-3.1-pro-preview" },
			{ id: "google/gemini-3-flash-preview" },
			{ id: "openai/gpt-5.4" },
			{ id: "openai/gpt-5.2-1211" },
			{ id: "openai/gpt-4o" },
			{ id: "qwen/qwen3-max" },
			{ id: "moonshot/kimi-k2.5" },
			{ id: "zhipu/glm-5" },
		]);
	}
}

export const accioAdapter = new AccioAdapter();

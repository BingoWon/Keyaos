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

const GATEWAY_BASE = "https://phoenix-gw.alibaba.com/api/adk/llm";
const API_URL = `${GATEWAY_BASE}/generateContent`;

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
			placeholder: "Paste refreshToken from phoenix_cookie",
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

		// Handle full cookie string: extract refreshToken from phoenix_cookie
		if (trimmed.includes("phoenix_cookie=")) {
			const match = trimmed.match(
				/phoenix_cookie=.*?refreshToken=([^&;\s]+)/,
			);
			if (match?.[1]) return match[1];
		}

		// Handle phoenix_cookie value: accessToken=xxx&refreshToken=xxx&expiresAt=xxx
		if (
			trimmed.includes("accessToken=") &&
			trimmed.includes("refreshToken=")
		) {
			const match = trimmed.match(/refreshToken=([^&;\s]+)/);
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

			const rt =
				(parsed.refreshToken as string) ??
				(parsed.refresh_token as string);
			if (rt) return rt;

			const at = parsed.accessToken as string;
			if (at) return at;

			throw new Error(
				'JSON does not contain a "refreshToken" field. Check the phoenix_cookie.',
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

	async fetchModels(_cnyUsdRate?: number): Promise<ParsedModel[]> {
		return parseStaticModels("accio", [
			{ id: "anthropic/claude-sonnet-4-20250514" },
			{ id: "google/gemini-2.5-flash" },
			{ id: "google/gemini-2.5-pro" },
			{ id: "google/gemini-3-flash-preview" },
			{ id: "google/gemini-3-pro-preview" },
			{ id: "google/gemini-3-pro-image-preview" },
			{ id: "openai/gpt-4o" },
			{ id: "openai/gpt-4o-mini" },
			{ id: "openai/gpt-4-turbo" },
			{ id: "openai/gpt-5-preview" },
		]);
	}
}

export const accioAdapter = new AccioAdapter();

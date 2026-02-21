/**
 * Gemini CLI Adapter — OAuth-based Gemini CodeAssist proxy
 *
 * Speaks Google's v1internal protocol via cloudcode-pa.googleapis.com.
 * Protocol conversion is delegated to protocols/gemini-native.ts for reuse.
 */

import {
	createGeminiToOpenAIStream,
	toGeminiRequest,
	toOpenAIResponse,
} from "../protocols/gemini-native";
import type {
	ParsedModel,
	ProviderAdapter,
	ProviderCredits,
	ProviderInfo,
} from "./interface";
import { dollarsToCentsPerM } from "./openai-compatible";

const CLOUDCODE_BASE = "https://cloudcode-pa.googleapis.com";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface CachedToken {
	accessToken: string;
	expiresAt: number;
	projectId: string;
}

const MODELS = [
	{
		id: "gemini-2.5-pro",
		name: "Gemini 2.5 Pro",
		inputUsd: 1.25,
		outputUsd: 10.0,
		ctx: 1_048_576,
	},
	{
		id: "gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		inputUsd: 0.15,
		outputUsd: 0.6,
		ctx: 1_048_576,
	},
	{
		id: "gemini-2.5-flash-lite",
		name: "Gemini 2.5 Flash Lite",
		inputUsd: 0.075,
		outputUsd: 0.3,
		ctx: 1_048_576,
	},
	{
		id: "gemini-2.0-flash",
		name: "Gemini 2.0 Flash",
		inputUsd: 0.1,
		outputUsd: 0.4,
		ctx: 1_048_576,
	},
	{
		id: "gemini-3-pro-preview",
		name: "Gemini 3 Pro Preview",
		inputUsd: 1.25,
		outputUsd: 10.0,
		ctx: 1_048_576,
	},
	{
		id: "gemini-3-flash-preview",
		name: "Gemini 3 Flash Preview",
		inputUsd: 0.15,
		outputUsd: 0.6,
		ctx: 1_048_576,
	},
];

export class GeminiCliAdapter implements ProviderAdapter {
	info: ProviderInfo = {
		id: "gemini-cli",
		name: "Gemini CLI",
		supportsAutoCredits: false,
		currency: "USD",
		authType: "oauth",
	};

	private cache = new Map<string, CachedToken>();
	private clientId = "";
	private clientSecret = "";

	configure(env: {
		GEMINI_OAUTH_CLIENT_ID?: string;
		GEMINI_OAUTH_CLIENT_SECRET?: string;
	}) {
		if (env.GEMINI_OAUTH_CLIENT_ID) this.clientId = env.GEMINI_OAUTH_CLIENT_ID;
		if (env.GEMINI_OAUTH_CLIENT_SECRET)
			this.clientSecret = env.GEMINI_OAUTH_CLIENT_SECRET;
	}

	private ensureConfigured() {
		if (!this.clientId || !this.clientSecret) {
			throw new Error(
				"Gemini CLI adapter not configured. Set GEMINI_OAUTH_CLIENT_ID and GEMINI_OAUTH_CLIENT_SECRET env vars.",
			);
		}
	}

	// ─── OAuth token management ─────────────────────────

	private async refresh(
		refreshToken: string,
	): Promise<{ accessToken: string; expiresIn: number }> {
		this.ensureConfigured();
		const res = await fetch(OAUTH_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: this.clientId,
				client_secret: this.clientSecret,
				refresh_token: refreshToken,
				grant_type: "refresh_token",
			}),
		});
		if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
		const json = (await res.json()) as {
			access_token: string;
			expires_in: number;
		};
		return { accessToken: json.access_token, expiresIn: json.expires_in };
	}

	private async discoverProject(accessToken: string): Promise<string> {
		const res = await fetch(`${CLOUDCODE_BASE}/v1internal:loadCodeAssist`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: "{}",
		});
		if (!res.ok) throw new Error(`Project discovery failed: ${res.status}`);
		const json = (await res.json()) as Record<string, string>;
		const id = json.cloudaicompanionProject ?? json.billingProject;
		if (!id) throw new Error("No project found in loadCodeAssist response");
		return id;
	}

	private async getToken(refreshToken: string): Promise<CachedToken> {
		const hit = this.cache.get(refreshToken);
		if (hit && hit.expiresAt > Date.now() + 60_000) return hit;

		const { accessToken, expiresIn } = await this.refresh(refreshToken);
		const projectId =
			hit?.projectId ?? (await this.discoverProject(accessToken));

		const entry: CachedToken = {
			accessToken,
			expiresAt: Date.now() + expiresIn * 1000,
			projectId,
		};
		this.cache.set(refreshToken, entry);
		return entry;
	}

	// ─── ProviderAdapter interface ──────────────────────

	async validateKey(secret: string): Promise<boolean> {
		try {
			const { accessToken } = await this.refresh(secret);
			const res = await fetch(`${CLOUDCODE_BASE}/v1internal:loadCodeAssist`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: "{}",
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
		let token: CachedToken;
		try {
			token = await this.getToken(secret);
		} catch {
			return new Response(
				JSON.stringify({
					error: { message: "OAuth token refresh failed", type: "auth_error" },
				}),
				{ status: 401, headers: { "Content-Type": "application/json" } },
			);
		}

		const streaming = body.stream === true;
		const geminiBody = toGeminiRequest(body, token.projectId);
		const url = streaming
			? `${CLOUDCODE_BASE}/v1internal:streamGenerateContent?alt=sse`
			: `${CLOUDCODE_BASE}/v1internal:streamGenerateContent`;

		const upstream = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token.accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(geminiBody),
		});

		if (!upstream.ok) {
			return new Response(upstream.body, {
				status: upstream.status,
				statusText: upstream.statusText,
			});
		}

		const model = body.model as string;

		if (streaming) {
			if (!upstream.body) return new Response("", { status: 502 });

			return new Response(
				upstream.body.pipeThrough(createGeminiToOpenAIStream(model)),
				{
					status: 200,
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
					},
				},
			);
		}

		const raw = await upstream.json();
		return new Response(JSON.stringify(toOpenAIResponse(raw, model)), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	async fetchModels(_cnyUsdRate?: number): Promise<ParsedModel[]> {
		return MODELS.map((m) => ({
			id: `gemini-cli:${m.id}`,
			provider: "gemini-cli",
			upstream_id: m.id,
			display_name: m.name,
			input_price: dollarsToCentsPerM(m.inputUsd),
			output_price: dollarsToCentsPerM(m.outputUsd),
			context_length: m.ctx,
			is_active: 1,
		}));
	}
}

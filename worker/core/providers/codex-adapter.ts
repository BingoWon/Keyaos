/**
 * Codex Adapter — ChatGPT OAuth-based Codex reverse proxy
 *
 * Speaks OpenAI Responses API via chatgpt.com/backend-api/codex.
 * Protocol conversion is delegated to protocols/codex-responses.ts.
 */

import codexModels from "../models/codex.json";
import {
	createResponsesToOpenAIStream,
	toOpenAIResponse,
	toResponsesRequest,
} from "../protocols/codex-responses";
import type {
	ParsedModel,
	ProviderAdapter,
	ProviderCredits,
	ProviderInfo,
} from "./interface";
import { dollarsToCentsPerM } from "./openai-compatible";

const CODEX_BASE = "https://chatgpt.com/backend-api/codex";
const OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";

// Public PKCE client — no client_secret by design.
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

interface CodexCredential {
	refresh_token: string;
	account_id: string;
}

interface CachedToken {
	accessToken: string;
	expiresAt: number;
}

export class CodexAdapter implements ProviderAdapter {
	info: ProviderInfo = {
		id: "codex",
		name: "Codex",
		logoUrl: "https://openai.com/favicon.ico",
		supportsAutoCredits: false,
		currency: "USD",
		authType: "oauth",
	};

	private cache = new Map<string, CachedToken>();

	// ─── Credential helpers ─────────────────────────────

	private parseCredential(secret: string): CodexCredential {
		const parsed = JSON.parse(secret) as CodexCredential;
		if (!parsed.refresh_token || !parsed.account_id) {
			throw new Error("Missing refresh_token or account_id");
		}
		return parsed;
	}

	// ─── OAuth token management ─────────────────────────

	private async refresh(
		refreshToken: string,
	): Promise<{ accessToken: string; expiresIn: number }> {
		const res = await fetch(OAUTH_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: CLIENT_ID,
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				scope: "openid profile email offline_access",
			}),
		});
		if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
		const json = (await res.json()) as {
			access_token: string;
			expires_in: number;
		};
		return { accessToken: json.access_token, expiresIn: json.expires_in };
	}

	private async getToken(refreshToken: string): Promise<string> {
		const hit = this.cache.get(refreshToken);
		if (hit && hit.expiresAt > Date.now() + 60_000) return hit.accessToken;

		const { accessToken, expiresIn } = await this.refresh(refreshToken);
		this.cache.set(refreshToken, {
			accessToken,
			expiresAt: Date.now() + expiresIn * 1000,
		});
		return accessToken;
	}

	// ─── ProviderAdapter interface ──────────────────────

	normalizeSecret(raw: string): string {
		const trimmed = raw.trim();

		let obj: Record<string, unknown>;
		try {
			obj = JSON.parse(trimmed);
		} catch {
			throw new Error(
				"Invalid input. Paste the full content of ~/.codex/auth.json, or a JSON with refresh_token and account_id.",
			);
		}

		const tokens = (obj.tokens ?? obj) as Record<string, unknown>;
		const rt = tokens.refresh_token as string | undefined;
		const aid = tokens.account_id as string | undefined;

		if (!rt) {
			throw new Error(
				'JSON does not contain "refresh_token". Check the content of ~/.codex/auth.json.',
			);
		}
		if (!aid) {
			throw new Error(
				'JSON does not contain "account_id". Both refresh_token and account_id are required from ~/.codex/auth.json.',
			);
		}

		return JSON.stringify({ refresh_token: rt, account_id: aid });
	}

	async validateKey(secret: string): Promise<boolean> {
		try {
			const { refresh_token } = this.parseCredential(secret);
			await this.refresh(refresh_token);
			return true;
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
		const cred = this.parseCredential(secret);

		let accessToken: string;
		try {
			accessToken = await this.getToken(cred.refresh_token);
		} catch {
			return new Response(
				JSON.stringify({
					error: { message: "OAuth token refresh failed", type: "auth_error" },
				}),
				{ status: 401, headers: { "Content-Type": "application/json" } },
			);
		}

		const streaming = body.stream === true;

		const stripped =
			typeof body.model === "string"
				? { ...body, model: body.model.replace(/^[^/]+\//, "") }
				: body;
		const responsesBody = toResponsesRequest(stripped);

		const upstream = await fetch(`${CODEX_BASE}/responses`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"ChatGPT-Account-ID": cred.account_id,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(responsesBody),
		});

		if (!upstream.ok) {
			return new Response(upstream.body, {
				status: upstream.status,
				statusText: upstream.statusText,
			});
		}

		const model = (body.model as string) ?? "codex";

		if (streaming) {
			if (!upstream.body) return new Response("", { status: 502 });
			return new Response(
				upstream.body.pipeThrough(createResponsesToOpenAIStream(model)),
				{
					status: 200,
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
					},
				},
			);
		}

		const raw = (await upstream.json()) as Record<string, unknown>;
		return new Response(JSON.stringify(toOpenAIResponse(raw, model)), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	async fetchModels(_cnyUsdRate?: number): Promise<ParsedModel[]> {
		return codexModels.map((m) => ({
			id: `codex:${m.id}`,
			provider: "codex",
			model_id: m.id,
			name: m.name,
			input_price: dollarsToCentsPerM(m.input_usd),
			output_price: dollarsToCentsPerM(m.output_usd),
			context_length: m.context_length,
			is_active: 1,
		}));
	}
}

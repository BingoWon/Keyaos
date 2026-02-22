/**
 * Codex Adapter — ChatGPT OAuth-based Codex reverse proxy
 *
 * Speaks OpenAI Responses API via chatgpt.com/backend-api/codex.
 * Protocol conversion is delegated to protocols/codex-responses.ts.
 *
 * OpenAI enforces refresh token rotation: each use of a refresh_token
 * invalidates it and returns a new one. The adapter captures the rotated
 * token via getRotatedSecret() so the caller can persist it to DB.
 */

import codexModels from "../models/codex.json";
import {
	collectStreamToResponse,
	createResponsesToOpenAIStream,
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
	access_token?: string;
	expires_at?: number;
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

	private rotatedSecret: string | null = null;

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
	): Promise<{
		accessToken: string;
		expiresIn: number;
		newRefreshToken: string | null;
	}> {
		// Match the official Codex CLI: JSON body, no offline_access scope
		const res = await fetch(OAUTH_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				client_id: CLIENT_ID,
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				scope: "openid profile email",
			}),
		});
		if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
		const json = (await res.json()) as {
			access_token: string;
			expires_in: number;
			refresh_token?: string;
		};
		return {
			accessToken: json.access_token,
			expiresIn: json.expires_in,
			newRefreshToken: json.refresh_token ?? null,
		};
	}

	private async getToken(cred: CodexCredential): Promise<{ accessToken: string; rotated: CodexCredential | null }> {
		if (cred.access_token && cred.expires_at && cred.expires_at > Date.now() + 60_000) {
			return { accessToken: cred.access_token, rotated: null };
		}

		const { accessToken, expiresIn, newRefreshToken } = await this.refresh(cred.refresh_token);
		const rotated: CodexCredential = {
			refresh_token: newRefreshToken ?? cred.refresh_token,
			account_id: cred.account_id,
			access_token: accessToken,
			expires_at: Date.now() + expiresIn * 1000,
		};
		return { accessToken, rotated };
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
		const at = tokens.access_token as string | undefined;

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

		const cred: CodexCredential = { refresh_token: rt, account_id: aid };
		if (at) {
			cred.access_token = at;
			try {
				const payload = JSON.parse(atob(at.split(".")[1]));
				if (payload.exp) cred.expires_at = payload.exp * 1000;
			} catch {
				// Can't parse JWT — skip expiry, will refresh on first use
			}
		}

		return JSON.stringify(cred);
	}

	async validateKey(secret: string): Promise<boolean> {
		try {
			const cred = this.parseCredential(secret);

			if (cred.access_token && cred.expires_at && cred.expires_at > Date.now() + 60_000) {
				const res = await fetch(`${CODEX_BASE}/responses`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${cred.access_token}`,
						"ChatGPT-Account-ID": cred.account_id,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model: "gpt-4.1-mini",
						instructions: "hi",
						input: [{ role: "user", content: "hi" }],
						store: false,
						stream: true,
					}),
				});
				return res.ok || res.status === 400;
			}

			// No valid access_token — must refresh (consumes the refresh_token)
			const { accessToken, rotated } = await this.getToken(cred);
			if (rotated) this.rotatedSecret = JSON.stringify(rotated);
			return !!accessToken;
		} catch {
			return false;
		}
	}

	getRotatedSecret(): string | null {
		const s = this.rotatedSecret;
		this.rotatedSecret = null;
		return s;
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
			const result = await this.getToken(cred);
			accessToken = result.accessToken;
			if (result.rotated) this.rotatedSecret = JSON.stringify(result.rotated);
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

		if (!upstream.body) return new Response("", { status: 502 });

		if (streaming) {
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

		// Upstream always streams; collect into a non-streaming response
		const result = await collectStreamToResponse(upstream.body, model);
		return new Response(JSON.stringify(result), {
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

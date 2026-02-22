/**
 * Antigravity Adapter — Google DeepMind's AI coding IDE
 *
 * Uses Google's v1internal protocol on daily-cloudcode-pa.sandbox.googleapis.com.
 * Same OAuth flow and response format as Gemini CLI, but with:
 *   - Different OAuth client credentials
 *   - Different base URL (sandbox endpoints with fallback)
 *   - Extended request fields (userAgent, requestType, requestId)
 *   - Broader model catalog (Gemini 3.x, Claude via Google proxy)
 *
 * Protocol conversion is shared via protocols/gemini-native.ts.
 */

import antigravityModels from "../models/antigravity.json";
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

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Antigravity OAuth client — public by design (different from Gemini CLI).
const AG_CID = [
	"1071006060591",
	"tmhssin2h21lcre235vtolojh4g403ep",
].join("-");
const OAUTH_CLIENT_ID = `${AG_CID}.apps.googleusercontent.com`;
const OAUTH_CLIENT_SECRET = `GOCSPX${"-"}K58FWR486LdLJ1mLB8sXC4z6qDAf`;

const BASE_URLS = [
	"https://daily-cloudcode-pa.sandbox.googleapis.com",
	"https://daily-cloudcode-pa.googleapis.com",
	"https://cloudcode-pa.googleapis.com",
];

const USER_AGENT = "antigravity/1.104.0 darwin/arm64";

interface CachedToken {
	accessToken: string;
	expiresAt: number;
	projectId: string;
	baseUrl: string;
}

export class AntigravityAdapter implements ProviderAdapter {
	info: ProviderInfo = {
		id: "antigravity",
		name: "Antigravity",
		logoUrl: "https://api.iconify.design/simple-icons:google.svg",
		supportsAutoCredits: false,
		currency: "USD",
		authType: "oauth",
	};

	private cache = new Map<string, CachedToken>();

	// ─── OAuth token management ─────────────────────────

	private async refresh(
		refreshToken: string,
	): Promise<{ accessToken: string; expiresIn: number }> {
		const res = await fetch(OAUTH_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: OAUTH_CLIENT_ID,
				client_secret: OAUTH_CLIENT_SECRET,
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

	private async discoverEndpoint(
		accessToken: string,
	): Promise<{ baseUrl: string; projectId: string }> {
		for (const baseUrl of BASE_URLS) {
			try {
				const res = await fetch(
					`${baseUrl}/v1internal:loadCodeAssist`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${accessToken}`,
							"Content-Type": "application/json",
							"User-Agent": USER_AGENT,
						},
						body: "{}",
					},
				);
				if (!res.ok) continue;
				const json = (await res.json()) as Record<string, string>;
				const projectId =
					json.cloudaicompanionProject ?? json.billingProject;
				if (projectId) return { baseUrl, projectId };
			} catch {
				continue;
			}
		}
		throw new Error("All Antigravity base URLs failed");
	}

	private async getToken(refreshToken: string): Promise<CachedToken> {
		const hit = this.cache.get(refreshToken);
		if (hit && hit.expiresAt > Date.now() + 60_000) return hit;

		const { accessToken, expiresIn } = await this.refresh(refreshToken);
		const { baseUrl, projectId } =
			hit?.baseUrl && hit?.projectId
				? hit
				: await this.discoverEndpoint(accessToken);

		const entry: CachedToken = {
			accessToken,
			expiresAt: Date.now() + expiresIn * 1000,
			projectId,
			baseUrl,
		};
		this.cache.set(refreshToken, entry);
		return entry;
	}

	// ─── Antigravity request builder ────────────────────

	private buildRequest(
		body: Record<string, unknown>,
		projectId: string,
	): Record<string, unknown> {
		const base = toGeminiRequest(body, projectId);
		return {
			...base,
			userAgent: "antigravity",
			requestType: "agent",
			requestId: `agent-${crypto.randomUUID()}`,
		};
	}

	// ─── ProviderAdapter interface ──────────────────────

	normalizeSecret(raw: string): string {
		const trimmed = raw.trim();

		if (trimmed.startsWith("{")) {
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(trimmed);
			} catch {
				throw new Error(
					"Invalid JSON. Paste the full content of an Antigravity account file or just the refresh_token value.",
				);
			}

			// Support both ~/.antigravity_tools/accounts/<uuid>.json and flat oauth_creds
			const token = parsed.token as Record<string, unknown> | undefined;
			const rt = (token?.refresh_token ?? parsed.refresh_token) as
				| string
				| undefined;
			if (!rt) {
				throw new Error(
					'JSON does not contain a "refresh_token" field. Paste the full account JSON from ~/.antigravity_tools/accounts/ or just the refresh_token.',
				);
			}
			return rt;
		}

		if (trimmed.startsWith("ya29.")) {
			throw new Error(
				'This is an access_token (expires in ~1 hour). Provide the refresh_token instead — it starts with "1//".',
			);
		}

		return trimmed;
	}

	async validateKey(secret: string): Promise<boolean> {
		try {
			const { accessToken } = await this.refresh(secret);
			for (const baseUrl of BASE_URLS) {
				try {
					const res = await fetch(
						`${baseUrl}/v1internal:loadCodeAssist`,
						{
							method: "POST",
							headers: {
								Authorization: `Bearer ${accessToken}`,
								"Content-Type": "application/json",
								"User-Agent": USER_AGENT,
							},
							body: "{}",
						},
					);
					if (res.ok) return true;
				} catch {
					continue;
				}
			}
			return false;
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
					error: {
						message: "OAuth token refresh failed",
						type: "auth_error",
					},
				}),
				{ status: 401, headers: { "Content-Type": "application/json" } },
			);
		}

		const streaming = body.stream === true;
		const antigravityBody = this.buildRequest(body, token.projectId);
		const url = streaming
			? `${token.baseUrl}/v1internal:streamGenerateContent?alt=sse`
			: `${token.baseUrl}/v1internal:streamGenerateContent`;

		const upstream = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token.accessToken}`,
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT,
			},
			body: JSON.stringify(antigravityBody),
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
		return antigravityModels.map((m) => ({
			id: `antigravity:${m.id}`,
			provider: "antigravity",
			model_id: m.id,
			name: m.name,
			input_price: dollarsToCentsPerM(m.input_usd),
			output_price: dollarsToCentsPerM(m.output_usd),
			context_length: m.context_length,
			is_active: 1,
		}));
	}
}

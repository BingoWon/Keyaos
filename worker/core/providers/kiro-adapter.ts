/**
 * Kiro IDE Adapter — AWS-based AI editor with custom binary protocol
 *
 * Auth: Social OAuth (GitHub/Google) refresh tokens via AWS auth service.
 * Protocol: Custom JSON request → AWS Event Stream binary response.
 * No client_id/client_secret needed for social auth — only refreshToken.
 */

import kiroModels from "../models/kiro.json";
import {
	createKiroToOpenAIStream,
	toKiroRequest,
	toOpenAIResponse,
} from "../protocols/kiro";
import type {
	ParsedModel,
	ProviderAdapter,
	ProviderCredits,
	ProviderInfo,
} from "./interface";
import { dollarsToCentsPerM } from "./openai-compatible";

// ─── Constants ──────────────────────────────────────────

const REGION = "us-east-1";
const KIRO_VERSION = "0.10.16";
const API_URL = `https://q.${REGION}.amazonaws.com/generateAssistantResponse`;
const REFRESH_URL = `https://prod.${REGION}.auth.desktop.kiro.dev/refreshToken`;
const DEFAULT_CONTEXT = 200_000;

interface ModelEntry {
	id: string;
	name: string;
	input_usd: number;
	output_usd: number;
	context_length: number;
}

// ─── Token cache ────────────────────────────────────────

interface CachedToken {
	accessToken: string;
	profileArn: string | null;
	expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

// ─── Helpers ────────────────────────────────────────────

function machineId(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const MACHINE_ID = machineId();

function buildHeaders(accessToken: string): Record<string, string> {
	const xAmz = `aws-sdk-js/1.0.27 KiroIDE-${KIRO_VERSION}-${MACHINE_ID}`;
	return {
		"Content-Type": "application/json",
		"x-amzn-codewhisperer-optout": "true",
		"x-amzn-kiro-agent-mode": "vibe",
		"x-amz-user-agent": xAmz,
		"User-Agent": `${xAmz} ua/2.1 os/linux lang/js`,
		Host: `q.${REGION}.amazonaws.com`,
		"amz-sdk-invocation-id": crypto.randomUUID(),
		"amz-sdk-request": "attempt=1; max=3",
		Authorization: `Bearer ${accessToken}`,
		Connection: "close",
	};
}

// ─── Adapter ────────────────────────────────────────────

export class KiroAdapter implements ProviderAdapter {
	info: ProviderInfo = {
		id: "kiro",
		name: "Kiro",
		logoUrl: "https://kiro.dev/favicon.ico",
		supportsAutoCredits: false,
		currency: "USD",
		authType: "oauth",
		isSubscription: true,
		credentialGuide: {
			placeholder: "aor...",
			filePath: "~/.aws/sso/cache/kiro-auth-token.json",
			command: "cat ~/.aws/sso/cache/kiro-auth-token.json",
			steps: [
				"Install Kiro IDE and sign in with GitHub or Google",
				"Run: cat ~/.aws/sso/cache/kiro-auth-token.json",
				"Paste the file contents or just the refreshToken value",
			],
		},
	};

	private async refresh(refreshToken: string): Promise<{
		accessToken: string;
		profileArn: string | null;
		expiresIn: number;
	}> {
		const res = await fetch(REFRESH_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": `KiroIDE-${KIRO_VERSION}-${MACHINE_ID}`,
			},
			body: JSON.stringify({ refreshToken }),
		});
		if (!res.ok) throw new Error(`Kiro token refresh failed: ${res.status}`);
		const data = (await res.json()) as {
			accessToken: string;
			profileArn?: string;
			expiresIn: number;
			refreshToken?: string;
		};
		return {
			accessToken: data.accessToken,
			profileArn: data.profileArn ?? null,
			expiresIn: data.expiresIn,
		};
	}

	private async getToken(refreshToken: string): Promise<CachedToken> {
		const hit = tokenCache.get(refreshToken);
		if (hit && hit.expiresAt > Date.now() + 60_000) return hit;

		const { accessToken, profileArn, expiresIn } =
			await this.refresh(refreshToken);

		const entry: CachedToken = {
			accessToken,
			profileArn,
			expiresAt: Date.now() + expiresIn * 1000,
		};
		tokenCache.set(refreshToken, entry);
		return entry;
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
					"Invalid JSON. Paste the content of ~/.aws/sso/cache/kiro-auth-token.json or just the refreshToken value.",
				);
			}

			const rt = parsed.refreshToken as string | undefined;
			if (!rt) {
				throw new Error(
					'JSON does not contain a "refreshToken" field. Check the content from ~/.aws/sso/cache/kiro-auth-token.json.',
				);
			}
			return rt;
		}

		if (trimmed.startsWith("aoa")) {
			throw new Error(
				'This looks like an accessToken (starts with "aoa", expires in ~1 hour). Provide the refreshToken instead — it starts with "aor".',
			);
		}

		return trimmed;
	}

	async validateKey(secret: string): Promise<boolean> {
		try {
			await this.refresh(secret);
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
		let token: CachedToken;
		try {
			token = await this.getToken(secret);
		} catch {
			return new Response(
				JSON.stringify({
					error: {
						message: "Kiro token refresh failed",
						type: "auth_error",
					},
				}),
				{ status: 401, headers: { "Content-Type": "application/json" } },
			);
		}

		const streaming = body.stream === true;
		const kiroBody = toKiroRequest(body, token.profileArn);

		const upstream = await fetch(API_URL, {
			method: "POST",
			headers: buildHeaders(token.accessToken),
			body: JSON.stringify(kiroBody),
		});

		if (!upstream.ok) {
			const errText = await upstream.text();
			return new Response(
				JSON.stringify({
					error: {
						message: errText || `Kiro upstream error: ${upstream.status}`,
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
		const contextLength = this.contextLengthFor(model);

		if (streaming) {
			if (!upstream.body) return new Response("", { status: 502 });

			return new Response(
				upstream.body.pipeThrough(
					createKiroToOpenAIStream(model, contextLength),
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

		const rawBytes = new Uint8Array(await upstream.arrayBuffer());
		const openaiResponse = toOpenAIResponse(rawBytes, model, contextLength);
		return new Response(JSON.stringify(openaiResponse), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	async fetchModels(_cnyUsdRate?: number): Promise<ParsedModel[]> {
		return (kiroModels as ModelEntry[]).map((m) => ({
			id: `kiro:${m.id}`,
			provider: "kiro",
			model_id: m.id,
			name: m.name,
			input_price: dollarsToCentsPerM(m.input_usd),
			output_price: dollarsToCentsPerM(m.output_usd),
			context_length: m.context_length,
			is_active: 1,
		}));
	}

	private contextLengthFor(model: string): number {
		const bare = model.replace(/^[^/]+\//, "");
		const entry = (kiroModels as ModelEntry[]).find(
			(m) => m.id === model || m.id === bare || m.id.endsWith(`/${bare}`),
		);
		return entry?.context_length ?? DEFAULT_CONTEXT;
	}
}

export const kiroAdapter = new KiroAdapter();

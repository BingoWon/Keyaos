/**
 * LLM client adapted for Keyaos — calls /v1/chat/completions with Clerk session token.
 * All provider-specific logic removed; Keyaos gateway handles model routing.
 */

import { gameSessionTracker } from "@wolf/lib/game-session-tracker";
import type { ModelRef } from "@wolf/types/game";

export type LLMContentPart =
	| {
			type: "text";
			text: string;
			cache_control?: { type: "ephemeral"; ttl?: "1h" };
	  }
	| { type: "image_url"; image_url: { url: string; detail?: string } }
	| {
			type: "input_audio";
			input_audio: { data: string; format: "mp3" | "wav" };
	  };

export type ApiKeySource = "user" | "project";

export interface LLMMessage {
	role: "system" | "user" | "assistant";
	content: string | LLMContentPart[];
	reasoning_details?: unknown;
}

// ─── Auth token store (set by React layer, read by non-React code) ───

let _getToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
	_getToken = getter;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
	if (!_getToken) return {};
	try {
		const token = await _getToken();
		if (token) return { Authorization: `Bearer ${token}` };
	} catch {}
	return {};
}

// ─── Model resolution (simplified — Keyaos handles routing) ───

export function resolveApiKeySource(_model: string): ApiKeySource {
	return "project";
}

export interface ChatCompletionResponse {
	id: string;
	choices: {
		message: {
			role: "assistant";
			content: string;
			reasoning_details?: unknown;
		};
		finish_reason: string;
	}[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export type ResponseFormat =
	| { type: "text" }
	| { type: "json_object" }
	| {
			type: "json_schema";
			strict?: boolean;
			json_schema: {
				name: string;
				description?: string;
				schema: unknown;
			};
	  };

export interface ReasoningOptions {
	enabled: boolean;
	effort?: "minimal" | "low" | "medium" | "high";
	max_tokens?: number;
}

export interface GenerateOptions {
	model: string;
	messages: LLMMessage[];
	temperature?: number;
	max_tokens?: number;
	reasoning?: ReasoningOptions;
	reasoning_effort?: "minimal" | "low" | "medium" | "high";
	response_format?: ResponseFormat;
}

// ─── Provider-aware parameter adaptation ───

function extractProvider(model: string): string {
	const slash = model.indexOf("/");
	return slash > 0 ? model.slice(0, slash).toLowerCase() : "";
}

function adaptBodyForProvider(
	model: string,
	body: Record<string, unknown>,
): Record<string, unknown> {
	const provider = extractProvider(model);
	if (provider !== "anthropic") return body;

	const adapted = { ...body };

	if (typeof adapted.temperature === "number" && adapted.temperature > 1) {
		adapted.temperature = 1.0;
	}

	if (
		adapted.response_format &&
		(adapted.response_format as ResponseFormat).type !== "json_schema"
	) {
		delete adapted.response_format;
	}

	return adapted;
}

export function mergeOptionsFromModelRef<T extends GenerateOptions>(
	modelRef: ModelRef | undefined,
	options: T,
): T {
	if (!modelRef) return options;
	const out = { ...options } as T;
	if (modelRef.temperature !== undefined)
		(out as GenerateOptions).temperature = modelRef.temperature;
	if (modelRef.reasoning !== undefined)
		(out as GenerateOptions).reasoning = modelRef.reasoning;
	return out;
}

export type BatchCompletionResult =
	| {
			ok: true;
			content: string;
			reasoning_details?: unknown;
			raw: ChatCompletionResponse;
	  }
	| { ok: false; error: string; status?: number };

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function parseRetryAfterMs(response: Response): number | null {
	const raw = response.headers.get("retry-after");
	if (!raw) return null;
	const sec = Number(raw);
	if (Number.isFinite(sec) && sec > 0) return Math.round(sec * 1000);
	const dateMs = Date.parse(raw);
	if (!Number.isFinite(dateMs)) return null;
	const diff = dateMs - Date.now();
	return diff > 0 ? diff : null;
}

const QUOTA_EXHAUSTED_MARKER = "[QUOTA_EXHAUSTED]";

function isQuotaExhaustedError(status: number, errorText: string): boolean {
	if (status === 402) return true;
	const lower = errorText.toLowerCase();
	return (
		lower.includes("insufficient") ||
		lower.includes("quota") ||
		lower.includes("balance") ||
		lower.includes("余额") ||
		lower.includes("欠费") ||
		lower.includes("arrearage")
	);
}

function formatApiError(status: number, errorText: string): string {
	let msg = `API error: ${status}`;
	try {
		const errorJson = JSON.parse(errorText) as Record<string, unknown>;
		if (
			typeof errorJson?.error === "string" &&
			(errorJson.error as string).trim()
		) {
			msg = (errorJson.error as string).trim();
		}
		const details = errorJson?.details as Record<string, unknown> | undefined;
		const detailsMsg = (details?.error as Record<string, unknown>)?.message;
		if (typeof detailsMsg === "string" && detailsMsg.trim()) {
			msg = `${msg} - ${detailsMsg.trim()}`;
		}
	} catch {
		const trimmed = (errorText || "").trim();
		msg = trimmed ? `${msg} - ${trimmed.slice(0, 600)}` : msg;
	}
	if (isQuotaExhaustedError(status, errorText)) {
		return `${QUOTA_EXHAUSTED_MARKER} ${msg}`;
	}
	return msg;
}

export function isQuotaExhaustedMessage(message: string): boolean {
	return message.includes(QUOTA_EXHAUSTED_MARKER);
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
	input: RequestInfo | URL,
	init: RequestInit,
	maxAttempts: number,
): Promise<Response> {
	let lastResponse: Response | null = null;
	let lastError: unknown = null;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await fetch(input, init);
			lastResponse = response;
			if (response.ok) return response;
			if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
				return response;
			}
			const retryAfterMs = parseRetryAfterMs(response);
			const base = response.status === 429 ? 1000 : 400;
			const jitter = Math.floor(Math.random() * 200);
			const backoffMs =
				(retryAfterMs !== null
					? Math.min(15000, Math.max(0, retryAfterMs))
					: base * 2 ** (attempt - 1)) + jitter;
			await sleep(backoffMs);
		} catch (err) {
			lastError = err;
			if (attempt === maxAttempts) break;
			const base = 400;
			const jitter = Math.floor(Math.random() * 200);
			const backoffMs = base * 2 ** (attempt - 1) + jitter;
			await sleep(backoffMs);
		}
	}
	if (lastResponse) return lastResponse;
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function stripMarkdownCodeFences(text: string): string {
	let t = text.trim();
	if (t.startsWith("```")) {
		t = t.replace(/^```[a-zA-Z0-9_-]*\s*/m, "");
		t = t.replace(/\s*```\s*$/m, "");
	}
	return t.trim();
}

function stripJsonPrefix(text: string): string {
	const t = text.trimStart();
	if (/^json\s*[[{]/i.test(t)) {
		return t.replace(/^json\s*/i, "");
	}
	return text;
}

function extractFirstJsonBlock(text: string): string | null {
	const startObj = text.indexOf("{");
	const startArr = text.indexOf("[");
	const start =
		startObj === -1
			? startArr
			: startArr === -1
				? startObj
				: Math.min(startObj, startArr);
	if (start === -1) return null;
	const opening = text[start];
	const expectedClosing = opening === "{" ? "}" : "]";
	let i = start;
	let depth = 0;
	let inString = false;
	let escaping = false;
	for (; i < text.length; i += 1) {
		const ch = text[i];
		if (inString) {
			if (escaping) {
				escaping = false;
				continue;
			}
			if (ch === "\\") {
				escaping = true;
				continue;
			}
			if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch === opening) {
			depth += 1;
			continue;
		}
		if (ch === expectedClosing) {
			depth -= 1;
			if (depth === 0) return text.slice(start, i + 1);
			continue;
		}
		if (opening === "{" && ch === "[") {
			depth += 1;
			continue;
		}
		if (opening === "{" && ch === "]") {
			depth = Math.max(0, depth - 1);
			if (depth === 0) return text.slice(start, i + 1);
			continue;
		}
		if (opening === "[" && ch === "{") {
			depth += 1;
			continue;
		}
		if (opening === "[" && ch === "}") {
			depth = Math.max(0, depth - 1);
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	return null;
}

function normalizeJsonText(text: string): string {
	return text
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/,\s*([}\]])/g, "$1")
		.trim();
}

function escapeDanglingQuotesInStrings(text: string): string {
	let out = "";
	let inString = false;
	let escaping = false;
	const nextNonWs = (idx: number): string | null => {
		for (let j = idx; j < text.length; j += 1) {
			const c = text[j];
			if (!/\s/.test(c)) return c;
		}
		return null;
	};
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		if (!inString) {
			if (ch === '"') inString = true;
			out += ch;
			continue;
		}
		if (escaping) {
			escaping = false;
			out += ch;
			continue;
		}
		if (ch === "\\") {
			escaping = true;
			out += ch;
			continue;
		}
		if (ch === '"') {
			const n = nextNonWs(i + 1);
			const isTerminator =
				n === null || n === "," || n === "}" || n === "]" || n === ":";
			if (isTerminator) {
				inString = false;
				out += ch;
				continue;
			}
			out += '\\"';
			continue;
		}
		out += ch;
	}
	return out;
}

function parseJsonTolerant<T>(raw: string): T {
	const trimmed = stripJsonPrefix(stripMarkdownCodeFences(raw));
	const direct = normalizeJsonText(trimmed);
	try {
		return JSON.parse(direct) as T;
	} catch {
		/* continue */
	}
	const extracted =
		extractFirstJsonBlock(direct) ?? extractFirstJsonBlock(trimmed);
	if (!extracted) throw new Error(`Failed to parse JSON response: ${raw}`);
	const normalized = normalizeJsonText(extracted);
	try {
		return JSON.parse(normalized) as T;
	} catch {
		/* continue */
	}
	const repaired = escapeDanglingQuotesInStrings(normalized);
	try {
		return JSON.parse(repaired) as T;
	} catch {
		throw new Error(`Failed to parse JSON response: ${raw}`);
	}
}

export async function generateCompletion(options: GenerateOptions): Promise<{
	content: string;
	reasoning_details?: unknown;
	raw: ChatCompletionResponse;
}> {
	const maxTokens =
		typeof options.max_tokens === "number" &&
		Number.isFinite(options.max_tokens)
			? Math.max(16, Math.floor(options.max_tokens))
			: undefined;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(await getAuthHeaders()),
	};

	const rawBody: Record<string, unknown> = {
		model: options.model,
		messages: options.messages,
		temperature: options.temperature ?? 0.7,
		max_tokens: maxTokens,
		...(options.reasoning ? { reasoning: options.reasoning } : {}),
		...(options.reasoning_effort
			? { reasoning_effort: options.reasoning_effort }
			: {}),
		...(options.response_format
			? { response_format: options.response_format }
			: {}),
	};

	const response = await fetchWithRetry(
		"/v1/chat/completions",
		{
			method: "POST",
			headers,
			body: JSON.stringify(adaptBodyForProvider(options.model, rawBody)),
		},
		4,
	);

	if (!response.ok) {
		const errorText = await response.text().catch(() => "");
		throw new Error(formatApiError(response.status, errorText));
	}

	const result: ChatCompletionResponse = await response.json();
	const choice = result.choices?.[0];
	const assistantMessage = choice?.message;

	if (!assistantMessage) {
		throw new Error(
			`No response from model. Raw response: ${JSON.stringify(result).slice(0, 500)}`,
		);
	}

	if (choice.finish_reason === "length") {
		console.warn(
			`[LLM] Output truncated (finish_reason=length). Consider increasing max_tokens.`,
		);
	}

	gameSessionTracker.trackAICall(
		0,
		0,
		result.usage?.prompt_tokens,
		result.usage?.completion_tokens,
	);

	return {
		content: assistantMessage.content,
		reasoning_details: assistantMessage.reasoning_details,
		raw: result,
	};
}

export async function generateCompletionBatch(
	requests: GenerateOptions[],
): Promise<BatchCompletionResult[]> {
	return Promise.all(
		requests.map(async (req): Promise<BatchCompletionResult> => {
			try {
				const result = await generateCompletion(req);
				return {
					ok: true,
					content: result.content,
					reasoning_details: result.reasoning_details,
					raw: result.raw,
				};
			} catch (err) {
				return {
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}),
	);
}

export async function* generateCompletionStream(
	options: GenerateOptions,
): AsyncGenerator<string, void, unknown> {
	const maxTokens =
		typeof options.max_tokens === "number" &&
		Number.isFinite(options.max_tokens)
			? Math.max(16, Math.floor(options.max_tokens))
			: undefined;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(await getAuthHeaders()),
	};

	const rawBody: Record<string, unknown> = {
		model: options.model,
		messages: options.messages,
		temperature: options.temperature ?? 0.7,
		max_tokens: maxTokens,
		stream: true,
		...(options.reasoning ? { reasoning: options.reasoning } : {}),
		...(options.reasoning_effort
			? { reasoning_effort: options.reasoning_effort }
			: {}),
		...(options.response_format
			? { response_format: options.response_format }
			: {}),
	};

	const response = await fetchWithRetry(
		"/v1/chat/completions",
		{
			method: "POST",
			headers,
			body: JSON.stringify(adaptBodyForProvider(options.model, rawBody)),
		},
		4,
	);

	if (!response.ok) {
		const errorText = await response.text().catch(() => "");
		throw new Error(formatApiError(response.status, errorText));
	}

	const reader = response.body?.getReader();
	if (!reader) throw new Error("No response body");

	const decoder = new TextDecoder();
	let buffer = "";
	let streamUsage: { prompt_tokens?: number; completion_tokens?: number } | undefined;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed === "data: [DONE]") continue;
			if (!trimmed.startsWith("data: ")) continue;
			try {
				const json = JSON.parse(trimmed.slice(6));
				if (json.usage) streamUsage = json.usage;
				const delta = json.choices?.[0]?.delta?.content;
				if (delta) yield delta;
			} catch {
				/* skip malformed */
			}
		}
	}

	gameSessionTracker.trackAICall(
		0,
		0,
		streamUsage?.prompt_tokens,
		streamUsage?.completion_tokens,
	);
}

export async function generateJSON<T>(
	options: GenerateOptions & { schema?: string },
): Promise<T> {
	const messagesWithFormat = [...options.messages];
	const lastMessage = messagesWithFormat[messagesWithFormat.length - 1];
	if (lastMessage && lastMessage.role === "user") {
		const suffix =
			'\n\nRespond with valid JSON only. No markdown, no code blocks, just raw JSON. If you need to include double quotes inside string values, escape them as \\".';
		if (typeof lastMessage.content === "string") {
			lastMessage.content += suffix;
		} else if (Array.isArray(lastMessage.content)) {
			const parts = lastMessage.content;
			const lastPart = parts[parts.length - 1];
			if (lastPart && lastPart.type === "text") {
				lastPart.text += suffix;
			} else {
				parts.push({ type: "text", text: suffix });
			}
		}
	}

	const result = await generateCompletion({
		...options,
		response_format: options.response_format ?? {
			type: "json_object" as const,
		},
		messages: messagesWithFormat,
	});

	return parseJsonTolerant<T>(result.content);
}

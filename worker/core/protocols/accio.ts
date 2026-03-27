/**
 * Accio ADK Protocol Converter (OpenAI ↔ Phoenix Gateway)
 *
 * Converts between OpenAI chat completion format and the Accio ADK
 * proto-based gateway at phoenix-gw.alibaba.com/api/adk/llm.
 *
 * The gateway wraps the upstream vendor's **native** response inside
 * `raw_response_json`, so we detect and handle three distinct formats:
 *   - Gemini:    candidates[].content.parts[].text
 *   - OpenAI:    choices[].delta.content
 *   - Anthropic: content_block_delta / message_delta / message_start
 */

import { extractText } from "./shared";

// ─── Shared Dictionary ──────────────────────────────────────

export const ACCIO_MODEL_MAP: Record<string, string> = {
	"claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
	"claude-opus-4-6": "anthropic/claude-opus-4.6",
	"claude-sonnet-4-20250514": "anthropic/claude-sonnet-4-20250514",
	"gemini-3.1-flash-image-preview": "google/gemini-3.1-flash-image",
	"gemini-3-flash-preview": "google/gemini-3-flash-preview",
	"gemini-3.1-pro-preview": "google/gemini-3.1-pro-preview",
	"gemini-3-pro-image-preview": "google/gemini-3-pro-image",
	"gemini-3-pro-preview": "google/gemini-3-pro-preview",
	"gemini-2.5-flash": "google/gemini-2.5-flash",
	"gemini-2.5-pro": "google/gemini-2.5-pro",
	"gpt-5.4": "openai/gpt-5.4",
	"gpt-5.2-1211": "openai/gpt-5.2",
	"gpt-4o": "openai/gpt-4o",
	"gpt-4o-mini": "openai/gpt-4o-mini",
	"gpt-4-turbo": "openai/gpt-4-turbo",
	"gpt-5-preview": "openai/gpt-5-preview",
	"qwen3-max-2026-01-23": "qwen/qwen3-max",
	"qwen3-max": "qwen/qwen3-max",
	"kimi-k2.5": "moonshotai/kimi-k2.5",
	"glm-5": "z-ai/glm-5",
	"minimax-m2.5": "minimax/minimax-m2.5",
};

export const OPENROUTER_TO_ACCIO_MAP = Object.fromEntries(
	Object.entries(ACCIO_MODEL_MAP).reverse().map(([k, v]) => [v, k])
);

// ─── Request: OpenAI → Accio ADK ────────────────────────

interface AccioPart {
	text?: string;
	thought: boolean;
}

interface AccioContent {
	role: "user" | "model";
	parts: AccioPart[];
}

export function toAccioRequest(
	body: Record<string, unknown>,
	token: string,
): Record<string, unknown> {
	const messages = body.messages as { role: string; content: unknown }[];

	const systemParts: AccioPart[] = [];
	const contents: AccioContent[] = [];

	for (const m of messages) {
		if (m.role === "system") {
			systemParts.push({ text: extractText(m.content), thought: false });
		} else {
			contents.push({
				role: m.role === "assistant" ? "model" : "user",
				parts: [{ text: extractText(m.content), thought: false }],
			});
		}
	}

	const rawModel = body.model as string;
	// Use exactly mapped model or fallback to stripping the provider prefix
	const model = OPENROUTER_TO_ACCIO_MAP[rawModel] ?? rawModel.replace(/^[^/]+\//, "");

	const request: Record<string, unknown> = {
		model,
		token,
		empid: "",
		tenant: "",
		iai_tag: "",
		request_id: `req-${Date.now()}`,
		contents,
		include_thoughts: false,
		stop_sequences: [],
		properties: {},
	};

	if (systemParts.length > 0) {
		request.system_instruction = { parts: systemParts };
	}

	if (body.temperature != null) request.temperature = body.temperature;
	if (body.max_tokens != null) request.max_output_tokens = body.max_tokens;
	if (body.top_p != null) request.top_p = body.top_p;

	// Default max_output_tokens to avoid thinking budget exhaustion
	if (request.max_output_tokens == null) request.max_output_tokens = 8192;

	return request;
}

// ─── Response: Accio SSE → OpenAI ───────────────────────

function mapFinishReason(reason?: string): string | null {
	switch (reason) {
		case "STOP":
			return "stop";
		case "MAX_TOKENS":
			return "length";
		case "SAFETY":
			return "content_filter";
		default:
			return null;
	}
}

interface GeminiUsage {
	promptTokenCount?: number;
	candidatesTokenCount?: number;
	totalTokenCount?: number;
	thoughtsTokenCount?: number;
}

function mapUsage(
	meta: GeminiUsage | undefined,
):
	| { prompt_tokens: number; completion_tokens: number; total_tokens: number }
	| undefined {
	if (!meta?.promptTokenCount) return undefined;
	const completion =
		(meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0);
	return {
		prompt_tokens: meta.promptTokenCount,
		completion_tokens: completion,
		total_tokens: meta.promptTokenCount + completion,
	};
}

// ─── Shared SSE utilities ───────────────────────────────

/** Extract the data payload from an SSE `data:` line, or null if not a data line. */
export function parseSSEDataLine(line: string): string | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("data:")) return null;
	const payload = trimmed.startsWith("data: ")
		? trimmed.substring(6)
		: trimmed.substring(5);
	return payload === "[DONE]" ? null : payload;
}

// ─── Raw response parsing ───────────────────────────────

interface ParsedFrame {
	text: string;
	finishReason: string | null;
	usage:
		| { prompt_tokens: number; completion_tokens: number; total_tokens: number }
		| undefined;
	responseId: string | undefined;
}

const EMPTY_FRAME: ParsedFrame = {
	text: "",
	finishReason: null,
	usage: undefined,
	responseId: undefined,
};

/** Parse the `raw_response_json` from a gateway SSE frame. */
function parseRawResponse(frame: Record<string, unknown>): ParsedFrame {
	const rawJson = frame.raw_response_json as string | undefined;
	if (!rawJson) return EMPTY_FRAME;

	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(rawJson);
	} catch {
		return EMPTY_FRAME;
	}

	// ── Gemini format: candidates[].content.parts[].text ──
	const candidates = raw.candidates as Record<string, unknown>[] | undefined;
	if (candidates?.length) {
		const c = candidates[0];
		const content = c?.content as { parts?: { text?: string }[] } | undefined;
		const text = content?.parts?.map((p) => p.text ?? "").join("") ?? "";
		return {
			text,
			finishReason: mapFinishReason(c?.finishReason as string | undefined),
			usage: mapUsage(raw.usageMetadata as GeminiUsage | undefined),
			responseId: raw.responseId as string | undefined,
		};
	}

	// ── OpenAI format: choices[].delta.content (streaming) ──
	const choices = raw.choices as Record<string, unknown>[] | undefined;
	if (choices?.length) {
		const choice = choices[0];
		const delta = choice?.delta as Record<string, unknown> | undefined;
		const text = (delta?.content as string) ?? "";
		const fr = choice?.finish_reason as string | null | undefined;

		const rawUsage = raw.usage as
			| { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
			| undefined;
		const usage = rawUsage?.prompt_tokens
			? {
					prompt_tokens: rawUsage.prompt_tokens,
					completion_tokens: rawUsage.completion_tokens ?? 0,
					total_tokens:
						rawUsage.total_tokens ??
						rawUsage.prompt_tokens + (rawUsage.completion_tokens ?? 0),
				}
			: undefined;

		return {
			text,
			finishReason: fr === "stop" || fr === "length" ? fr : null,
			usage,
			responseId: raw.id as string | undefined,
		};
	}

	// ── Anthropic format ──
	const aType = raw.type as string | undefined;
	if (aType === "content_block_delta") {
		const delta = raw.delta as { text?: string } | undefined;
		return { text: delta?.text ?? "", finishReason: null, usage: undefined, responseId: undefined };
	}
	if (aType === "message_delta") {
		const delta = raw.delta as { stop_reason?: string } | undefined;
		const fr =
			delta?.stop_reason === "end_turn" ? "stop"
			: delta?.stop_reason === "max_tokens" ? "length"
			: null;
		const rawUsage = raw.usage as { output_tokens?: number } | undefined;
		const usage = rawUsage?.output_tokens
			? { prompt_tokens: 0, completion_tokens: rawUsage.output_tokens, total_tokens: rawUsage.output_tokens }
			: undefined;
		return { text: "", finishReason: fr, usage, responseId: undefined };
	}
	if (aType === "message_start") {
		const msg = raw.message as { id?: string; usage?: { input_tokens?: number } } | undefined;
		const inputTokens = msg?.usage?.input_tokens;
		const usage = inputTokens
			? { prompt_tokens: inputTokens, completion_tokens: 0, total_tokens: inputTokens }
			: undefined;
		return { text: "", finishReason: null, usage, responseId: msg?.id };
	}

	return EMPTY_FRAME;
}

/** Convert a non-streaming Accio gateway response (collected SSE frames) to OpenAI chat.completion. */
export function toOpenAIResponse(
	frames: Record<string, unknown>[],
	model: string,
): Record<string, unknown> {
	const parts: string[] = [];
	let lastFinishReason: string | null = null;
	let responseId: string | undefined;

	// Accumulate usage across frames (Anthropic splits input/output across message_start and message_delta)
	const mergedUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
	let hasUsage = false;

	for (const frame of frames) {
		const parsed = parseRawResponse(frame);
		if (parsed.text) parts.push(parsed.text);
		if (parsed.finishReason) lastFinishReason = parsed.finishReason;
		responseId ??= parsed.responseId;
		if (parsed.usage) {
			hasUsage = true;
			mergedUsage.prompt_tokens += parsed.usage.prompt_tokens;
			mergedUsage.completion_tokens += parsed.usage.completion_tokens;
			mergedUsage.total_tokens += parsed.usage.total_tokens;
		}
	}

	return {
		id: `chatcmpl-${responseId ?? crypto.randomUUID()}`,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [
			{
				index: 0,
				message: { role: "assistant", content: parts.join("") },
				finish_reason: lastFinishReason ?? "stop",
			},
		],
		...(hasUsage && { usage: mergedUsage }),
	};
}

// ─── Streaming: Accio SSE → OpenAI SSE ─────────────────

/**
 * Creates a TransformStream that converts Accio gateway SSE to OpenAI SSE.
 * Input: raw bytes from POST /api/adk/llm/generateContent (SSE with raw_response_json)
 * Output: OpenAI-format SSE with `data: [DONE]` terminator
 */
export function createAccioToOpenAIStream(
	model: string,
): TransformStream<Uint8Array, Uint8Array> {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const chatId = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
	const created = Math.floor(Date.now() / 1000);
	let buffer = "";
	let isFirst = true;

	return new TransformStream({
		transform(chunk, controller) {
			buffer += decoder.decode(chunk, { stream: true });

			while (true) {
				const end = buffer.indexOf("\n\n");
				if (end === -1) break;

				const raw = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);

				for (const line of raw.split("\n")) {
					const dataStr = parseSSEDataLine(line);
					if (dataStr === null) continue;

					let parsed: Record<string, unknown>;
					try {
						parsed = JSON.parse(dataStr);
					} catch {
						continue;
					}

					const { text, finishReason, usage } = parseRawResponse(parsed);

					const delta: Record<string, string> = {};
					if (isFirst) {
						delta.role = "assistant";
						isFirst = false;
					}
					if (text) delta.content = text;

					const openaiChunk: Record<string, unknown> = {
						id: chatId,
						object: "chat.completion.chunk",
						created,
						model,
						choices: [{ index: 0, delta, finish_reason: finishReason }],
					};

					if (usage) openaiChunk.usage = usage;

					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`),
					);
				}
			}
		},
		flush(controller) {
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
		},
	});
}

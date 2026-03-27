/**
 * Accio ADK Protocol Converter (OpenAI ↔ Phoenix Gateway)
 *
 * Converts between OpenAI chat completion format and the Accio ADK
 * proto-based gateway at phoenix-gw.alibaba.com/api/adk/llm.
 *
 * The gateway wraps Gemini-style responses in an envelope with
 * `raw_response_json` containing the actual model output.
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
	"gpt-5.2-1211": "openai/gpt-5.2-1211",
	"gpt-4o": "openai/gpt-4o",
	"gpt-4o-mini": "openai/gpt-4o-mini",
	"gpt-4-turbo": "openai/gpt-4-turbo",
	"gpt-5-preview": "openai/gpt-5-preview",
	"qwen3-max-2026-01-23": "qwen/qwen3-max",
	"qwen3-max": "qwen/qwen3-max",
	"kimi-k2.5": "moonshot/kimi-k2.5",
	"glm-5": "zhipu/glm-5",
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

/** Parse the `raw_response_json` from a gateway SSE frame. */
function parseRawResponse(frame: Record<string, unknown>): {
	text: string;
	finishReason: string | null;
	usage: ReturnType<typeof mapUsage>;
} {
	const rawJson = frame.raw_response_json as string | undefined;
	if (!rawJson) return { text: "", finishReason: null, usage: undefined };

	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(rawJson);
	} catch {
		return { text: "", finishReason: null, usage: undefined };
	}

	const candidates = raw.candidates as Record<string, unknown>[] | undefined;
	const c = candidates?.[0];
	const content = c?.content as { parts?: { text?: string }[] } | undefined;
	const text = content?.parts?.map((p) => p.text ?? "").join("") ?? "";
	const finishReason = mapFinishReason(c?.finishReason as string | undefined);
	const usage = mapUsage(raw.usageMetadata as GeminiUsage | undefined);

	return { text, finishReason, usage };
}

/** Convert a non-streaming Accio gateway response (collected SSE frames) to OpenAI chat.completion. */
export function toOpenAIResponse(
	frames: Record<string, unknown>[],
	model: string,
): Record<string, unknown> {
	const parts: string[] = [];
	let lastFinishReason: string | null = null;
	let lastUsage: ReturnType<typeof mapUsage>;
	let responseId: string | undefined;

	for (const frame of frames) {
		const { text, finishReason, usage } = parseRawResponse(frame);
		if (text) parts.push(text);
		if (finishReason) lastFinishReason = finishReason;
		if (usage) lastUsage = usage;

		// Extract responseId from raw_response_json
		try {
			const raw = JSON.parse(frame.raw_response_json as string);
			responseId ??= raw.responseId;
		} catch {}
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
		...(lastUsage && { usage: lastUsage }),
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

				const frame = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);

				for (const line of frame.split("\n")) {
					const trimmed = line.trim();
					if (!trimmed.startsWith("data:")) continue;

					const dataStr = trimmed.startsWith("data: ")
						? trimmed.substring(6)
						: trimmed.substring(5);

					if (dataStr === "[DONE]") continue;

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

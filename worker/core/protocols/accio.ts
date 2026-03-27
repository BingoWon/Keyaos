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

import { extractText, parseSSEDataLine } from "./shared";

/**
 * Accio model name → OpenRouter canonical ID.
 * Only models returned by Accio's /llm/config endpoint belong here.
 * Run `POST /api/llm/config` to refresh the list.
 */
export const ACCIO_MODEL_MAP: Record<string, string> = {
	// Anthropic
	"claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
	"claude-opus-4-6": "anthropic/claude-opus-4.6",
	// Google (visible)
	"gemini-3-flash-preview": "google/gemini-3-flash-preview",
	"gemini-3.1-pro-preview": "google/gemini-3.1-pro-preview",
	// Google (currently hidden by Accio — kept for forward-compatibility)
	"gemini-3.1-flash-image-preview": "google/gemini-3.1-flash-image",
	"gemini-3-pro-preview": "google/gemini-3-pro-preview",
	"gemini-3-pro-image-preview": "google/gemini-3-pro-image",
	// OpenAI
	"gpt-5.4": "openai/gpt-5.4",
	"gpt-5.2-1211": "openai/gpt-5.2",
	// Alibaba / Qwen
	"qwen3-max-2026-01-23": "qwen/qwen3-max",
	"qwen3-max": "qwen/qwen3-max",
	// Moonshot
	"kimi-k2.5": "moonshotai/kimi-k2.5",
	// Zhipu
	"glm-5": "z-ai/glm-5",
	// MiniMax
	"minimax-m2.5": "minimax/minimax-m2.5",
};

export const OPENROUTER_TO_ACCIO_MAP = Object.fromEntries(
	Object.entries(ACCIO_MODEL_MAP)
		.reverse()
		.map(([k, v]) => [v, k]),
);

// ─── Request: OpenAI → Accio ADK ────────────────────────

interface AccioPart {
	text?: string;
	function_call?: { id: string; name: string; args_json: string };
	function_response?: { id: string; name: string; response_json: string };
}

interface AccioContent {
	role: "user" | "model" | "tool";
	parts: AccioPart[];
}

interface OpenAIToolCall {
	index: number;
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

export function toAccioRequest(
	body: Record<string, unknown>,
	token: string,
): Record<string, unknown> {
	const messages = body.messages as Record<string, unknown>[];

	const systemTexts: string[] = [];
	const contents: AccioContent[] = [];

	for (const m of messages) {
		const role = m.role as string;
		if (role === "system" || role === "developer") {
			const t = extractText(m.content);
			if (t) systemTexts.push(t);
		} else if (role === "tool") {
			// OpenAI tool result → Accio functionResponse
			const toolCallId = (m.tool_call_id as string) ?? "";
			const resultContent =
				typeof m.content === "string" ? m.content : JSON.stringify(m.content);
			contents.push({
				role: "tool",
				parts: [
					{
						function_response: {
							id: toolCallId,
							name: (m.name as string) ?? "",
							response_json: JSON.stringify({
								content: resultContent,
								is_error: false,
							}),
						},
					},
				],
			});
		} else if (role === "assistant" && m.tool_calls) {
			// Assistant message with tool_calls → Accio model + functionCall parts
			const toolCalls = m.tool_calls as {
				id: string;
				function: { name: string; arguments: string };
			}[];
			const parts: AccioPart[] = [];
			if (m.content) parts.push({ text: extractText(m.content) });
			for (const tc of toolCalls) {
				parts.push({
					function_call: {
						id: tc.id,
						name: tc.function.name,
						args_json: tc.function.arguments,
					},
				});
			}
			contents.push({ role: "model", parts });
		} else {
			contents.push({
				role: role === "assistant" ? "model" : "user",
				parts: [{ text: extractText(m.content) }],
			});
		}
	}

	const rawModel = body.model as string;
	// Use exactly mapped model or fallback to stripping the provider prefix
	const model =
		OPENROUTER_TO_ACCIO_MAP[rawModel] ?? rawModel.replace(/^[^/]+\//, "");

	const request: Record<string, unknown> = {
		// ── Core identity (matches real Accio ADK convertRequestToProto) ──
		model,
		token,
		empid: "",
		tenant: "",
		iai_tag: "",
		request_id: `req-${Date.now()}`,
		message_id: "",
		// ── Content ──
		contents,
		include_thoughts: false,
		stop_sequences: (body.stop as string[] | undefined) ?? [],
		properties: {},
	};

	// ── Inline system prompt into first user message ──
	// Accio's generateContent endpoint does NOT support `system_instruction`;
	// all tested formats return 400 "Invalid request format".
	// Instead, prepend the system text to the first user message.
	if (systemTexts.length > 0) {
		const systemBlock = systemTexts.join("\n\n");
		const firstUserIdx = contents.findIndex((c) => c.role === "user");
		if (firstUserIdx >= 0) {
			const firstUser = contents[firstUserIdx];
			const existingText =
				firstUser.parts.map((p) => p.text ?? "").join("") || "";
			contents[firstUserIdx] = {
				role: "user",
				parts: [{ text: `${systemBlock}\n\n${existingText}` }],
			};
		} else {
			// No user message yet — insert system as first user message
			contents.unshift({
				role: "user",
				parts: [{ text: systemBlock }],
			});
		}
	}

	// ── Generation parameters ──
	// Accio returns 505 when both temperature AND top_p are sent together.
	// Prefer temperature (more commonly set by clients); only send top_p alone.
	if (body.temperature != null) {
		request.temperature = body.temperature;
	} else if (body.top_p != null) {
		request.top_p = body.top_p;
	}
	if (body.max_tokens != null) request.max_output_tokens = body.max_tokens;

	// Default max_output_tokens to avoid thinking budget exhaustion
	if (request.max_output_tokens == null) request.max_output_tokens = 8192;

	// ── Advanced parameters (forwarded when present) ──
	if (body.response_format != null)
		request.response_format = body.response_format;

	// ── Tools: OpenAI format → Accio proto ToolDeclaration ──
	const tools = body.tools as
		| {
				type: string;
				function: { name: string; description?: string; parameters?: unknown };
		  }[]
		| undefined;
	if (tools?.length) {
		request.tools = tools
			.filter((t) => t.type === "function" && t.function)
			.map((t) => ({
				name: t.function.name,
				description: t.function.description ?? "",
				parameters_json: JSON.stringify(t.function.parameters ?? {}),
			}));
	}

	// ── Tool choice ──
	if (body.tool_choice != null) {
		const choice = body.tool_choice;
		if (typeof choice === "string") {
			// "auto", "none", "required"
			request.tool_choice = choice;
		} else if (typeof choice === "object") {
			// {type:"function", function:{name:"xxx"}} → pass through
			request.tool_choice = choice;
		}
	}

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

// parseSSEDataLine lives in ./shared (generic SSE utility, not Accio-specific)

// ─── Raw response parsing ───────────────────────────────

interface ParsedFrame {
	text: string;
	finishReason: string | null;
	usage:
		| { prompt_tokens: number; completion_tokens: number; total_tokens: number }
		| undefined;
	responseId: string | undefined;
	toolCalls?: OpenAIToolCall[];
	/** Anthropic input_json_delta partial JSON fragment to accumulate onto the last tool call */
	partialToolJson?: string;
}

const EMPTY_FRAME: ParsedFrame = {
	text: "",
	finishReason: null,
	usage: undefined,
	responseId: undefined,
};

/** Parse the `raw_response_json` from a gateway SSE frame. */
function parseRawResponse(frame: Record<string, unknown>): ParsedFrame {
	// ── Handle Accio-level error frames (error is embedded in SSE, HTTP is still 200) ──
	const errorCode = frame.error_code as string | undefined;
	if (errorCode) {
		const errorMsg =
			(frame.error_message as string) ?? `Accio error ${errorCode}`;
		return {
			text: `[Error ${errorCode}] ${errorMsg}`,
			finishReason: "stop",
			usage: undefined,
			responseId: undefined,
		};
	}

	const rawJson = frame.raw_response_json as string | undefined;
	if (!rawJson) return EMPTY_FRAME;

	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(rawJson);
	} catch {
		return EMPTY_FRAME;
	}

	// ── Gemini format: candidates[].content.parts[].text | functionCall ──
	const candidates = raw.candidates as Record<string, unknown>[] | undefined;
	if (candidates?.length) {
		const c = candidates[0];
		const content = c?.content as
			| { parts?: Record<string, unknown>[] }
			| undefined;
		const parts = content?.parts ?? [];

		const textParts: string[] = [];
		const toolCalls: OpenAIToolCall[] = [];

		for (const p of parts) {
			if (p.text) textParts.push(p.text as string);
			if (p.functionCall) {
				const fc = p.functionCall as {
					id?: string;
					name?: string;
					args?: unknown;
				};
				toolCalls.push({
					index: toolCalls.length,
					id: fc.id ?? `call_${crypto.randomUUID().slice(0, 8)}`,
					type: "function",
					function: {
						name: fc.name ?? "",
						arguments:
							typeof fc.args === "string"
								? fc.args
								: JSON.stringify(fc.args ?? {}),
					},
				});
			}
		}

		const fr = mapFinishReason(c?.finishReason as string | undefined);
		return {
			text: textParts.join(""),
			finishReason: toolCalls.length > 0 ? "tool_calls" : fr,
			usage: mapUsage(raw.usageMetadata as GeminiUsage | undefined),
			responseId: raw.responseId as string | undefined,
			...(toolCalls.length > 0 && { toolCalls }),
		};
	}

	// ── OpenAI format: choices[].delta.content / tool_calls (streaming) ──
	const choices = raw.choices as Record<string, unknown>[] | undefined;
	if (choices?.length) {
		const choice = choices[0];
		const delta = choice?.delta as Record<string, unknown> | undefined;
		const msg = choice?.message as Record<string, unknown> | undefined;
		const text = (delta?.content as string) ?? (msg?.content as string) ?? "";
		const fr = choice?.finish_reason as string | null | undefined;

		// Forward tool_calls from upstream OpenAI responses
		const rawToolCalls = (delta?.tool_calls ?? msg?.tool_calls) as
			| {
					id?: string;
					type?: string;
					function?: { name?: string; arguments?: string };
			  }[]
			| undefined;
		const toolCalls: OpenAIToolCall[] | undefined = rawToolCalls?.map(
			(tc, i) => ({
				index: i,
				id: tc.id ?? `call_${crypto.randomUUID().slice(0, 8)}`,
				type: "function" as const,
				function: {
					name: tc.function?.name ?? "",
					arguments: tc.function?.arguments ?? "",
				},
			}),
		);

		const rawUsage = raw.usage as
			| {
					prompt_tokens?: number;
					completion_tokens?: number;
					total_tokens?: number;
			  }
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
			finishReason: toolCalls?.length
				? "tool_calls"
				: fr === "stop" || fr === "length" || fr === "tool_calls"
					? fr
					: null,
			usage,
			responseId: raw.id as string | undefined,
			...(toolCalls?.length && { toolCalls }),
		};
	}

	// ── Anthropic format ──
	const aType = raw.type as string | undefined;
	if (aType === "content_block_start") {
		// Anthropic tool_use block start: {type:"content_block_start", content_block:{type:"tool_use",id,name,input:{}}}
		const block = raw.content_block as
			| { type?: string; id?: string; name?: string; input?: unknown }
			| undefined;
		if (block?.type === "tool_use") {
			const blockIndex = raw.index as number | undefined;
			return {
				text: "",
				finishReason: null,
				usage: undefined,
				responseId: undefined,
				toolCalls: [
					{
						index: blockIndex ?? 0,
						id: block.id ?? `call_${crypto.randomUUID().slice(0, 8)}`,
						type: "function",
						function: {
							name: block.name ?? "",
							arguments: JSON.stringify(block.input ?? {}),
						},
					},
				],
			};
		}
		return EMPTY_FRAME;
	}
	if (aType === "content_block_delta") {
		const delta = raw.delta as
			| { type?: string; text?: string; partial_json?: string }
			| undefined;
		if (delta?.type === "input_json_delta" && delta.partial_json) {
			// Return the partial JSON fragment for accumulation by the caller
			return {
				text: "",
				finishReason: null,
				usage: undefined,
				responseId: undefined,
				partialToolJson: delta.partial_json,
			};
		}
		return {
			text: delta?.text ?? "",
			finishReason: null,
			usage: undefined,
			responseId: undefined,
		};
	}
	if (aType === "message_delta") {
		const delta = raw.delta as { stop_reason?: string } | undefined;
		const fr =
			delta?.stop_reason === "end_turn"
				? "stop"
				: delta?.stop_reason === "max_tokens"
					? "length"
					: delta?.stop_reason === "tool_use"
						? "tool_calls"
						: null;
		const rawUsage = raw.usage as { output_tokens?: number } | undefined;
		const usage = rawUsage?.output_tokens
			? {
					prompt_tokens: 0,
					completion_tokens: rawUsage.output_tokens,
					total_tokens: rawUsage.output_tokens,
				}
			: undefined;
		return { text: "", finishReason: fr, usage, responseId: undefined };
	}
	if (aType === "message_start") {
		const msg = raw.message as
			| { id?: string; usage?: { input_tokens?: number } }
			| undefined;
		const inputTokens = msg?.usage?.input_tokens;
		const usage = inputTokens
			? {
					prompt_tokens: inputTokens,
					completion_tokens: 0,
					total_tokens: inputTokens,
				}
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
	const allToolCalls: OpenAIToolCall[] = [];

	// Accumulate usage across frames (Anthropic splits input/output across message_start and message_delta)
	const mergedUsage = {
		prompt_tokens: 0,
		completion_tokens: 0,
		total_tokens: 0,
	};
	let hasUsage = false;

	for (const frame of frames) {
		const parsed = parseRawResponse(frame);
		if (parsed.text) parts.push(parsed.text);
		if (parsed.finishReason) lastFinishReason = parsed.finishReason;
		if (parsed.toolCalls) allToolCalls.push(...parsed.toolCalls);
		// Accumulate Anthropic input_json_delta partials onto the last tool call
		if (parsed.partialToolJson && allToolCalls.length > 0) {
			const lastTc = allToolCalls[allToolCalls.length - 1];
			const prev = lastTc.function.arguments;
			lastTc.function.arguments =
				prev === "{}" ? parsed.partialToolJson : prev + parsed.partialToolJson;
		}
		responseId ??= parsed.responseId;
		if (parsed.usage) {
			hasUsage = true;
			mergedUsage.prompt_tokens += parsed.usage.prompt_tokens;
			mergedUsage.completion_tokens += parsed.usage.completion_tokens;
			mergedUsage.total_tokens += parsed.usage.total_tokens;
		}
	}

	const message: Record<string, unknown> = {
		role: "assistant",
		content: parts.join("") || null,
	};
	if (allToolCalls.length > 0) {
		// Re-index all tool calls sequentially for the final response
		message.tool_calls = allToolCalls.map((tc, i) => ({ ...tc, index: i }));
	}

	return {
		id: `chatcmpl-${responseId ?? crypto.randomUUID()}`,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [
			{
				index: 0,
				message,
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
	// State for accumulating Anthropic tool_use across frames
	const pendingToolCalls: OpenAIToolCall[] = [];
	let currentToolArgsAccumulator = "";

	const emitChunk = (
		controller: TransformStreamDefaultController<Uint8Array>,
		delta: Record<string, unknown>,
		finishReason: string | null,
		usage?: Record<string, unknown>,
	) => {
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
	};

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

					const frame = parseRawResponse(parsed);

					// ── Handle new tool call definitions (Anthropic content_block_start / Gemini functionCall) ──
					if (frame.toolCalls?.length) {
						for (const tc of frame.toolCalls) {
							tc.index = pendingToolCalls.length;
							pendingToolCalls.push(tc);
							currentToolArgsAccumulator = "";

							// Emit the first chunk for this tool_call: id + name + empty arguments
							const firstDelta: Record<string, unknown> = {};
							if (isFirst) {
								firstDelta.role = "assistant";
								firstDelta.content = null;
								isFirst = false;
							}
							firstDelta.tool_calls = [
								{
									index: tc.index,
									id: tc.id,
									type: "function",
									function: { name: tc.function.name, arguments: "" },
								},
							];
							emitChunk(controller, firstDelta, null);
						}
						continue;
					}

					// ── Handle Anthropic input_json_delta partials ──
					if (frame.partialToolJson && pendingToolCalls.length > 0) {
						const lastTc = pendingToolCalls[pendingToolCalls.length - 1];
						currentToolArgsAccumulator += frame.partialToolJson;
						lastTc.function.arguments = currentToolArgsAccumulator;

						// Emit incremental arguments chunk (no id, only index + partial args)
						emitChunk(
							controller,
							{
								tool_calls: [
									{
										index: lastTc.index,
										function: { arguments: frame.partialToolJson },
									},
								],
							},
							null,
						);
						continue;
					}

					// ── Handle regular text / finish / usage frames ──
					const { text, finishReason, usage } = frame;

					const delta: Record<string, unknown> = {};
					if (isFirst) {
						delta.role = "assistant";
						isFirst = false;
					}
					if (text) delta.content = text;

					// Skip empty deltas unless there's a finish_reason or usage
					if (!text && !finishReason && !usage && !delta.role) {
						continue;
					}

					emitChunk(
						controller,
						delta,
						finishReason,
						usage as Record<string, unknown> | undefined,
					);
				}
			}
		},
		flush(controller) {
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
		},
	});
}

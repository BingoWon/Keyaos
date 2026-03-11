/**
 * Anthropic Protocol Converter (Anthropic Messages ↔ OpenAI Chat Completions)
 *
 * Two-way conversion:
 * 1. Inbound (messages.ts): Anthropic SDK users → OpenAI internal format
 * 2. Outbound (anthropic-adapter.ts): OpenAI internal format → Anthropic native API
 */

import { extractText } from "./shared";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INBOUND: Anthropic SDK users calling Keyaos
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Request: Anthropic → OpenAI ────────────────────────

export function toOpenAIRequest(
	body: Record<string, unknown>,
): Record<string, unknown> {
	const messages: Record<string, unknown>[] = [];

	const system = body.system;
	if (system) {
		const text =
			typeof system === "string"
				? system
				: (system as { type: string; text: string }[])
						.filter((b) => b.type === "text")
						.map((b) => b.text)
						.join("\n");
		if (text) messages.push({ role: "system", content: text });
	}

	for (const msg of body.messages as { role: string; content: unknown }[]) {
		if (typeof msg.content === "string") {
			messages.push({ role: msg.role, content: msg.content });
			continue;
		}

		const blocks = msg.content as Record<string, unknown>[];

		if (msg.role === "assistant") {
			let text = "";
			const toolCalls: Record<string, unknown>[] = [];

			for (const b of blocks) {
				if (b.type === "text") {
					text += b.text;
				} else if (b.type === "tool_use") {
					toolCalls.push({
						id: b.id,
						type: "function",
						function: {
							name: b.name,
							arguments: JSON.stringify(b.input),
						},
					});
				}
			}

			const m: Record<string, unknown> = { role: "assistant" };
			if (text) m.content = text;
			if (toolCalls.length) m.tool_calls = toolCalls;
			messages.push(m);
		} else {
			const parts: Record<string, unknown>[] = [];

			for (const b of blocks) {
				if (b.type === "tool_result") {
					messages.push({
						role: "tool",
						tool_call_id: b.tool_use_id,
						content:
							typeof b.content === "string"
								? b.content
								: extractText(b.content),
					});
				} else if (b.type === "text") {
					parts.push({ type: "text", text: b.text });
				} else if (b.type === "image") {
					const src = b.source as {
						media_type: string;
						data: string;
					};
					parts.push({
						type: "image_url",
						image_url: {
							url: `data:${src.media_type};base64,${src.data}`,
						},
					});
				}
			}

			if (parts.length === 1 && parts[0].type === "text") {
				messages.push({ role: "user", content: parts[0].text });
			} else if (parts.length > 0) {
				messages.push({ role: "user", content: parts });
			}
		}
	}

	const result: Record<string, unknown> = {
		model: body.model,
		messages,
		max_tokens: body.max_tokens,
	};

	if (body.temperature != null) result.temperature = body.temperature;
	if (body.top_p != null) result.top_p = body.top_p;
	if (body.stop_sequences) result.stop = body.stop_sequences;
	if (body.stream != null) result.stream = body.stream;

	const tools = body.tools as Record<string, unknown>[] | undefined;
	if (tools?.length) {
		result.tools = tools.map((t) => ({
			type: "function",
			function: {
				name: t.name,
				description: t.description,
				parameters: t.input_schema,
			},
		}));
	}

	const tc = body.tool_choice as Record<string, unknown> | undefined;
	if (tc) {
		if (tc.type === "auto") result.tool_choice = "auto";
		else if (tc.type === "any") result.tool_choice = "required";
		else if (tc.type === "tool") {
			result.tool_choice = {
				type: "function",
				function: { name: tc.name },
			};
		}
	}

	return result;
}

// ─── Response: OpenAI → Anthropic ───────────────────────

function mapStopReason(reason: string | null): string {
	switch (reason) {
		case "stop":
			return "end_turn";
		case "length":
			return "max_tokens";
		case "tool_calls":
			return "tool_use";
		default:
			return "end_turn";
	}
}

export function toAnthropicResponse(
	openai: Record<string, unknown>,
	model: string,
): Record<string, unknown> {
	const choice = (openai.choices as Record<string, unknown>[])?.[0];
	const message = choice?.message as Record<string, unknown>;
	const usage = openai.usage as Record<string, number> | undefined;

	const content: Record<string, unknown>[] = [];

	const reasoning =
		(message?.reasoning as string) || (message?.reasoning_content as string);
	if (reasoning) {
		content.push({ type: "thinking", thinking: reasoning });
	}

	if (message?.content) {
		content.push({ type: "text", text: message.content });
	}

	if (message?.tool_calls) {
		for (const tc of message.tool_calls as Record<string, unknown>[]) {
			const fn = tc.function as Record<string, unknown>;
			let input: unknown;
			try {
				input = JSON.parse(fn.arguments as string);
			} catch {
				input = {};
			}
			content.push({
				type: "tool_use",
				id: tc.id,
				name: fn.name,
				input,
			});
		}
	}

	const id = (openai.id as string) || "";
	return {
		id: `msg_${id.replace("chatcmpl-", "") || crypto.randomUUID().slice(0, 12)}`,
		type: "message",
		role: "assistant",
		content,
		model,
		stop_reason: mapStopReason(choice?.finish_reason as string),
		stop_sequence: null,
		usage: {
			input_tokens: usage?.prompt_tokens ?? 0,
			output_tokens: usage?.completion_tokens ?? 0,
		},
	};
}

// ─── Streaming: OpenAI SSE → Anthropic SSE ──────────────

export function createOpenAIToAnthropicStream(
	model: string,
): TransformStream<Uint8Array, Uint8Array> {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const msgId = `msg_${crypto.randomUUID().slice(0, 12)}`;

	let buffer = "";
	let started = false;
	let blockIndex = 0;
	let blockType: "thinking" | "text" | "tool_use" | null = null;
	let finished = false;
	let inputTokens = 0;
	let outputTokens = 0;

	function emit(
		ctrl: TransformStreamDefaultController<Uint8Array>,
		event: string,
		data: Record<string, unknown>,
	) {
		ctrl.enqueue(
			encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
		);
	}

	function ensureStarted(ctrl: TransformStreamDefaultController<Uint8Array>) {
		if (started) return;
		emit(ctrl, "message_start", {
			type: "message_start",
			message: {
				id: msgId,
				type: "message",
				role: "assistant",
				content: [],
				model,
				stop_reason: null,
				stop_sequence: null,
				usage: { input_tokens: inputTokens, output_tokens: 0 },
			},
		});
		emit(ctrl, "ping", { type: "ping" });
		started = true;
	}

	function closeBlock(ctrl: TransformStreamDefaultController<Uint8Array>) {
		if (!blockType) return;
		emit(ctrl, "content_block_stop", {
			type: "content_block_stop",
			index: blockIndex,
		});
		blockIndex++;
		blockType = null;
	}

	function finalize(
		ctrl: TransformStreamDefaultController<Uint8Array>,
		stopReason: string,
	) {
		if (finished) return;
		closeBlock(ctrl);
		emit(ctrl, "message_delta", {
			type: "message_delta",
			delta: { stop_reason: stopReason, stop_sequence: null },
			usage: { output_tokens: outputTokens },
		});
		emit(ctrl, "message_stop", { type: "message_stop" });
		finished = true;
	}

	return new TransformStream({
		transform(chunk, ctrl) {
			buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");

			while (true) {
				const end = buffer.indexOf("\n\n");
				if (end === -1) break;

				const frame = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);

				for (const line of frame.split("\n")) {
					const trimmed = line.trim();
					if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]")
						continue;

					let data: Record<string, unknown>;
					try {
						data = JSON.parse(trimmed.substring(6));
					} catch {
						continue;
					}

					const choice = (data.choices as Record<string, unknown>[])?.[0];
					if (!choice) continue;

					const delta = choice.delta as Record<string, unknown> | undefined;
					const finishReason = choice.finish_reason as string | null;
					const usage = data.usage as Record<string, number> | undefined;

					if (usage) {
						inputTokens = usage.prompt_tokens || inputTokens;
						outputTokens = usage.completion_tokens || outputTokens;
					}

					if (delta && !started) ensureStarted(ctrl);

					const reasoning =
						(delta?.reasoning as string) ??
						(delta?.reasoning_content as string);
					if (reasoning) {
						if (blockType !== "thinking") {
							closeBlock(ctrl);
							emit(ctrl, "content_block_start", {
								type: "content_block_start",
								index: blockIndex,
								content_block: { type: "thinking", thinking: "" },
							});
							blockType = "thinking";
						}
						emit(ctrl, "content_block_delta", {
							type: "content_block_delta",
							index: blockIndex,
							delta: { type: "thinking_delta", thinking: reasoning },
						});
					}

					if (delta?.content) {
						if (blockType !== "text") {
							closeBlock(ctrl);
							emit(ctrl, "content_block_start", {
								type: "content_block_start",
								index: blockIndex,
								content_block: { type: "text", text: "" },
							});
							blockType = "text";
						}
						emit(ctrl, "content_block_delta", {
							type: "content_block_delta",
							index: blockIndex,
							delta: { type: "text_delta", text: delta.content },
						});
					}

					if (delta?.tool_calls) {
						for (const tc of delta.tool_calls as Record<string, unknown>[]) {
							const fn = tc.function as Record<string, unknown> | undefined;

							if (tc.id) {
								closeBlock(ctrl);
								emit(ctrl, "content_block_start", {
									type: "content_block_start",
									index: blockIndex,
									content_block: {
										type: "tool_use",
										id: tc.id,
										name: fn?.name ?? "",
										input: {},
									},
								});
								blockType = "tool_use";
							}

							if (fn?.arguments) {
								emit(ctrl, "content_block_delta", {
									type: "content_block_delta",
									index: blockIndex,
									delta: {
										type: "input_json_delta",
										partial_json: fn.arguments,
									},
								});
							}
						}
					}

					if (finishReason) {
						finalize(ctrl, mapStopReason(finishReason));
					}
				}
			}
		},
		flush(ctrl) {
			if (!finished) {
				if (started) finalize(ctrl, "end_turn");
				else {
					ensureStarted(ctrl);
					finalize(ctrl, "end_turn");
				}
			}
		},
	});
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OUTBOUND: Keyaos forwarding to Anthropic native API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Request: OpenAI → Anthropic Native ─────────────────

export function toAnthropicNativeRequest(
	body: Record<string, unknown>,
): Record<string, unknown> {
	const messages = body.messages as { role: string; content: unknown }[];

	let system: string | undefined;
	const nativeMsgs: Record<string, unknown>[] = [];

	for (const msg of messages) {
		if (msg.role === "system") {
			system = extractText(msg.content);
			continue;
		}

		if (msg.role === "tool") {
			nativeMsgs.push({
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: (msg as Record<string, unknown>).tool_call_id,
						content: extractText(msg.content),
					},
				],
			});
			continue;
		}

		if (msg.role === "assistant") {
			if (typeof msg.content === "string") {
				const m = msg as Record<string, unknown>;
				if (m.tool_calls) {
					const content: Record<string, unknown>[] = [];
					if (msg.content) content.push({ type: "text", text: msg.content });
					for (const tc of m.tool_calls as Record<string, unknown>[]) {
						const fn = tc.function as Record<string, unknown>;
						let input: unknown;
						try {
							input = JSON.parse(fn.arguments as string);
						} catch {
							input = {};
						}
						content.push({ type: "tool_use", id: tc.id, name: fn.name, input });
					}
					nativeMsgs.push({ role: "assistant", content });
				} else {
					nativeMsgs.push({ role: "assistant", content: msg.content });
				}
			} else {
				nativeMsgs.push({ role: msg.role, content: msg.content });
			}
			continue;
		}

		// user role — convert image_url blocks
		if (typeof msg.content === "string") {
			nativeMsgs.push({ role: "user", content: msg.content });
		} else {
			const blocks = msg.content as Record<string, unknown>[];
			const content: Record<string, unknown>[] = [];
			for (const b of blocks) {
				if (b.type === "text") {
					content.push({ type: "text", text: b.text });
				} else if (b.type === "image_url") {
					const url = (b.image_url as { url: string }).url;
					const m = url.match(/^data:(image\/\w+);base64,(.+)/);
					if (m) {
						content.push({
							type: "image",
							source: { type: "base64", media_type: m[1], data: m[2] },
						});
					}
				}
			}
			nativeMsgs.push({ role: "user", content });
		}
	}

	const result: Record<string, unknown> = {
		model: body.model,
		messages: nativeMsgs,
		max_tokens: body.max_tokens ?? body.max_completion_tokens ?? 4096,
	};

	if (system) result.system = system;
	if (body.temperature != null) result.temperature = body.temperature;
	if (body.top_p != null) result.top_p = body.top_p;
	if (body.stop) result.stop_sequences = body.stop;
	if (body.stream === true) result.stream = true;

	const tools = body.tools as Record<string, unknown>[] | undefined;
	if (tools?.length) {
		result.tools = tools.map((t) => {
			const fn = (t.function ?? t) as Record<string, unknown>;
			return {
				name: fn.name,
				description: fn.description,
				input_schema: fn.parameters ?? fn.input_schema,
			};
		});
	}

	const tc = body.tool_choice;
	if (tc === "auto") result.tool_choice = { type: "auto" };
	else if (tc === "required") result.tool_choice = { type: "any" };
	else if (tc && typeof tc === "object") {
		const fn = (tc as Record<string, unknown>).function as
			| Record<string, unknown>
			| undefined;
		if (fn?.name) result.tool_choice = { type: "tool", name: fn.name };
	}

	return result;
}

// ─── Response: Anthropic Native → OpenAI ────────────────

function mapFinishReason(reason: string | null): string {
	switch (reason) {
		case "end_turn":
			return "stop";
		case "max_tokens":
			return "length";
		case "tool_use":
			return "tool_calls";
		case "stop_sequence":
			return "stop";
		default:
			return "stop";
	}
}

export function fromAnthropicNativeResponse(
	resp: Record<string, unknown>,
): Record<string, unknown> {
	const content = resp.content as Record<string, unknown>[] | undefined;
	const usage = resp.usage as Record<string, number> | undefined;

	let text = "";
	const toolCalls: Record<string, unknown>[] = [];

	for (const block of content ?? []) {
		if (block.type === "text") text += block.text;
		else if (block.type === "tool_use") {
			toolCalls.push({
				id: block.id,
				type: "function",
				function: {
					name: block.name,
					arguments: JSON.stringify(block.input),
				},
			});
		}
	}

	const message: Record<string, unknown> = { role: "assistant", content: text };
	if (toolCalls.length) message.tool_calls = toolCalls;

	return {
		id: `chatcmpl-${(resp.id as string)?.replace("msg_", "") ?? crypto.randomUUID().slice(0, 12)}`,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model: resp.model,
		choices: [
			{
				index: 0,
				message,
				finish_reason: mapFinishReason(resp.stop_reason as string | null),
			},
		],
		usage: {
			prompt_tokens: usage?.input_tokens ?? 0,
			completion_tokens: usage?.output_tokens ?? 0,
			total_tokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
		},
	};
}

// ─── Streaming: Anthropic Native SSE → OpenAI SSE ───────

export function createAnthropicNativeToOpenAIStream(
	model: string,
): TransformStream<Uint8Array, Uint8Array> {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const chatId = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
	const created = Math.floor(Date.now() / 1000);

	let buffer = "";
	let isFirst = true;
	let inputTokens = 0;
	let outputTokens = 0;

	function emitChunk(
		ctrl: TransformStreamDefaultController<Uint8Array>,
		delta: Record<string, unknown>,
		finishReason: string | null,
		usage?: Record<string, unknown>,
	) {
		const chunk: Record<string, unknown> = {
			id: chatId,
			object: "chat.completion.chunk",
			created,
			model,
			choices: [{ index: 0, delta, finish_reason: finishReason }],
		};
		if (usage) chunk.usage = usage;
		ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
	}

	return new TransformStream({
		transform(chunk, ctrl) {
			buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");

			while (true) {
				const end = buffer.indexOf("\n\n");
				if (end === -1) break;

				const frame = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);

				let eventType: string | null = null;
				let dataStr: string | null = null;
				for (const line of frame.split("\n")) {
					if (line.startsWith("event: ")) eventType = line.slice(7).trim();
					else if (line.startsWith("data: ")) dataStr = line.slice(6);
				}
				if (!eventType || !dataStr) continue;

				let data: Record<string, unknown>;
				try {
					data = JSON.parse(dataStr);
				} catch {
					continue;
				}

				switch (eventType) {
					case "message_start": {
						const msg = data.message as Record<string, unknown> | undefined;
						const u = msg?.usage as Record<string, number> | undefined;
						if (u) inputTokens = u.input_tokens ?? 0;
						if (isFirst) {
							emitChunk(ctrl, { role: "assistant", content: "" }, null);
							isFirst = false;
						}
						break;
					}
					case "content_block_delta": {
						const delta = data.delta as Record<string, unknown> | undefined;
						if (delta?.type === "text_delta" && delta.text) {
							emitChunk(ctrl, { content: delta.text }, null);
						} else if (delta?.type === "thinking_delta" && delta.thinking) {
							emitChunk(ctrl, { reasoning_content: delta.thinking }, null);
						} else if (
							delta?.type === "input_json_delta" &&
							delta.partial_json
						) {
							emitChunk(
								ctrl,
								{
									tool_calls: [
										{
											index: data.index ?? 0,
											function: { arguments: delta.partial_json },
										},
									],
								},
								null,
							);
						}
						break;
					}
					case "content_block_start": {
						const block = data.content_block as
							| Record<string, unknown>
							| undefined;
						if (block?.type === "tool_use") {
							emitChunk(
								ctrl,
								{
									tool_calls: [
										{
											index: data.index ?? 0,
											id: block.id,
											type: "function",
											function: {
												name: block.name,
												arguments: "",
											},
										},
									],
								},
								null,
							);
						}
						break;
					}
					case "message_delta": {
						const u = data.usage as Record<string, number> | undefined;
						if (u) outputTokens = u.output_tokens ?? outputTokens;
						const d = data.delta as Record<string, unknown> | undefined;
						const reason = mapFinishReason((d?.stop_reason as string) ?? null);
						emitChunk(ctrl, {}, reason, {
							prompt_tokens: inputTokens,
							completion_tokens: outputTokens,
							total_tokens: inputTokens + outputTokens,
						});
						break;
					}
				}
			}
		},
		flush(ctrl) {
			ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
		},
	});
}

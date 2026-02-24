/**
 * Kiro Protocol Converter (OpenAI ↔ AWS Kiro)
 *
 * Handles bidirectional conversion between OpenAI chat.completions format
 * and Kiro's custom generateAssistantResponse format + AWS Event Stream.
 *
 * Works in Cloudflare Workers (no Node.js Buffer/zlib dependency).
 */

import { extractText } from "./shared";

// ─── Request: OpenAI → Kiro ─────────────────────────────

interface KiroMessage {
	userInputMessage?: { content: string; modelId: string; origin: string };
	assistantResponseMessage?: { content: string };
}

export function toKiroRequest(
	body: Record<string, unknown>,
	profileArn: string | null,
): Record<string, unknown> {
	const messages = body.messages as { role: string; content: unknown }[];
	const rawModel = body.model as string;
	const modelId = rawModel.replace(/^[^/]+\//, "");

	const history: KiroMessage[] = [];

	let systemText = "";
	for (const m of messages) {
		if (m.role === "system") {
			systemText += (systemText ? "\n" : "") + extractText(m.content);
		}
	}

	if (systemText) {
		history.push({
			userInputMessage: { content: systemText, modelId, origin: "AI_EDITOR" },
		});
		history.push({
			assistantResponseMessage: {
				content: "I will follow these instructions.",
			},
		});
	}

	const nonSystem = messages.filter((m) => m.role !== "system");
	const historyMessages = nonSystem.slice(0, -1);
	const lastMessage = nonSystem[nonSystem.length - 1];

	for (const m of historyMessages) {
		if (m.role === "user") {
			history.push({
				userInputMessage: {
					content: extractText(m.content),
					modelId,
					origin: "AI_EDITOR",
				},
			});
		} else if (m.role === "assistant") {
			history.push({
				assistantResponseMessage: { content: extractText(m.content) },
			});
		}
	}

	const currentContent = lastMessage
		? extractText(lastMessage.content)
		: "continue";

	const request: Record<string, unknown> = {
		conversationState: {
			agentContinuationId: crypto.randomUUID(),
			agentTaskType: "vibe",
			chatTriggerType: "MANUAL",
			currentMessage: {
				userInputMessage: {
					content: currentContent,
					modelId,
					origin: "AI_EDITOR",
				},
			},
			conversationId: crypto.randomUUID(),
			history,
		},
	};

	if (profileArn) {
		request.profileArn = profileArn;
	}

	return request;
}

// ─── AWS Event Stream Parser ────────────────────────────
// Minimal parser for the binary framing used by Kiro responses.
// No CRC validation (not needed for correctness in a trusted channel).

const PRELUDE_SIZE = 12;
const MSG_CRC_SIZE = 4;
const MIN_MSG = PRELUDE_SIZE + MSG_CRC_SIZE;

interface EventFrame {
	eventType: string;
	data: Record<string, unknown> | null;
}

function parseHeadersFromView(
	view: DataView,
	offset: number,
	length: number,
): Map<string, string> {
	const headers = new Map<string, string>();
	const end = offset + length;
	let pos = offset;

	while (pos < end) {
		const nameLen = view.getUint8(pos);
		pos++;
		const nameBytes = new Uint8Array(
			view.buffer,
			view.byteOffset + pos,
			nameLen,
		);
		const name = new TextDecoder().decode(nameBytes);
		pos += nameLen;
		const hType = view.getUint8(pos);
		pos++;

		if (hType === 7) {
			const strLen = view.getUint16(pos);
			pos += 2;
			const strBytes = new Uint8Array(
				view.buffer,
				view.byteOffset + pos,
				strLen,
			);
			headers.set(name, new TextDecoder().decode(strBytes));
			pos += strLen;
		} else if (hType === 6) {
			const bytesLen = view.getUint16(pos);
			pos += 2;
			pos += bytesLen;
		} else if (hType === 0 || hType === 1) {
			/* bool */
		} else if (hType === 4) {
			pos += 4;
		} else if (hType === 5 || hType === 8) {
			pos += 8;
		} else if (hType === 2) {
			pos++;
		} else if (hType === 3) {
			pos += 2;
		} else if (hType === 9) {
			pos += 16;
		} else {
			break;
		}
	}
	return headers;
}

function parseFrames(data: Uint8Array): EventFrame[] {
	const results: EventFrame[] = [];
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	let off = 0;

	while (data.byteLength - off >= MIN_MSG) {
		const totalLen = view.getUint32(off);
		const headersLen = view.getUint32(off + 4);
		if (totalLen < MIN_MSG || data.byteLength - off < totalLen) break;

		const headersStart = off + PRELUDE_SIZE;
		const headers = parseHeadersFromView(view, headersStart, headersLen);

		const payloadStart = headersStart + headersLen;
		const payloadEnd = off + totalLen - MSG_CRC_SIZE;
		const payload = data.subarray(payloadStart, payloadEnd);

		if (
			headers.get(":content-type") === "application/vnd.amazon.eventstream" &&
			payload.byteLength >= MIN_MSG
		) {
			results.push(...parseFrames(payload));
		} else if (payload.byteLength > 0) {
			let parsed: Record<string, unknown> | null = null;
			try {
				parsed = JSON.parse(new TextDecoder().decode(payload));
			} catch {
				/* non-JSON payload */
			}
			results.push({
				eventType: headers.get(":event-type") ?? "unknown",
				data: parsed,
			});
		}
		off += totalLen;
	}
	return results;
}

// ─── Response: Kiro → OpenAI (non-streaming) ────────────

export function toOpenAIResponse(
	rawBytes: Uint8Array,
	model: string,
	contextLength: number,
): Record<string, unknown> {
	const frames = parseFrames(rawBytes);
	let text = "";
	let inputTokens = 0;
	let outputTokens = 0;

	for (const frame of frames) {
		if (frame.eventType === "assistantResponseEvent") {
			text += (frame.data?.content as string) ?? "";
		} else if (frame.eventType === "contextUsageEvent") {
			const pct = (frame.data?.contextUsagePercentage as number) ?? 0;
			const normalized = pct > 1 ? pct / 100 : pct;
			const est = Math.round(normalized * contextLength);
			if (est > inputTokens) inputTokens = est;
		}
	}

	outputTokens = estimateTokens(text);

	return {
		id: `chatcmpl-${crypto.randomUUID().slice(0, 12)}`,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [
			{
				index: 0,
				message: { role: "assistant", content: text },
				finish_reason: "stop",
			},
		],
		usage: {
			prompt_tokens: inputTokens,
			completion_tokens: outputTokens,
			total_tokens: inputTokens + outputTokens,
		},
	};
}

// ─── Streaming: Kiro Event Stream → OpenAI SSE ─────────

/**
 * TransformStream that converts Kiro binary Event Stream to OpenAI SSE.
 * Input: raw binary chunks from Kiro's generateAssistantResponse.
 * Output: OpenAI-format `data: {...}\n\n` frames + `data: [DONE]\n\n`.
 */
export function createKiroToOpenAIStream(
	model: string,
	contextLength: number,
): TransformStream<Uint8Array, Uint8Array> {
	const encoder = new TextEncoder();
	const chatId = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
	const created = Math.floor(Date.now() / 1000);
	let isFirst = true;
	let buffer = new Uint8Array(0);
	let inputTokens = 0;
	let outputTokens = 0;
	let outputText = "";

	return new TransformStream({
		transform(chunk, controller) {
			const merged = new Uint8Array(buffer.length + chunk.length);
			merged.set(buffer);
			merged.set(chunk, buffer.length);
			buffer = merged;

			const view = new DataView(
				buffer.buffer,
				buffer.byteOffset,
				buffer.byteLength,
			);
			let off = 0;

			while (buffer.byteLength - off >= MIN_MSG) {
				const totalLen = view.getUint32(off);
				if (totalLen < MIN_MSG || buffer.byteLength - off < totalLen) break;

				const frameData = buffer.subarray(off, off + totalLen);
				const frames = parseFrames(frameData);

				for (const frame of frames) {
					if (frame.eventType === "assistantResponseEvent") {
						const content = (frame.data?.content as string) ?? "";
						if (!content) continue;
						outputText += content;

						const delta: Record<string, string> = {};
						if (isFirst) {
							delta.role = "assistant";
							isFirst = false;
						}
						delta.content = content;

						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({
									id: chatId,
									object: "chat.completion.chunk",
									created,
									model,
									choices: [{ index: 0, delta, finish_reason: null }],
								})}\n\n`,
							),
						);
					} else if (frame.eventType === "contextUsageEvent") {
						const pct = (frame.data?.contextUsagePercentage as number) ?? 0;
						const normalized = pct > 1 ? pct / 100 : pct;
						const est = Math.round(normalized * contextLength);
						if (est > inputTokens) inputTokens = est;
					}
				}
				off += totalLen;
			}
			buffer = buffer.subarray(off);
		},
		flush(controller) {
			outputTokens = estimateTokens(outputText);

			controller.enqueue(
				encoder.encode(
					`data: ${JSON.stringify({
						id: chatId,
						object: "chat.completion.chunk",
						created,
						model,
						choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
						usage: {
							prompt_tokens: inputTokens,
							completion_tokens: outputTokens,
							total_tokens: inputTokens + outputTokens,
						},
					})}\n\n`,
				),
			);
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
		},
	});
}

// ─── Token estimation ───────────────────────────────────
// Lightweight char-based approximation (no tiktoken dependency).

function estimateTokens(text: string): number {
	if (!text) return 0;
	let units = 0;
	for (const ch of text) {
		units += ch.charCodeAt(0) > 0x024f ? 4 : 1;
	}
	return Math.max(1, Math.round(units / 4));
}

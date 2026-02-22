/**
 * Codex Responses API Protocol Converter (OpenAI Chat Completions ↔ Responses API)
 *
 * Converts between the standard /v1/chat/completions format our platform speaks
 * and the /responses format that chatgpt.com/backend-api/codex expects.
 */

// ─── Request: Chat Completions → Responses API ─────────────

export function toResponsesRequest(
	body: Record<string, unknown>,
): Record<string, unknown> {
	const messages = body.messages as
		| { role: string; content: unknown }[]
		| undefined;

	let instructions = "You are a helpful assistant.";
	const input: { role: string; content: string }[] = [];

	if (messages) {
		for (const m of messages) {
			const text =
				typeof m.content === "string"
					? m.content
					: Array.isArray(m.content)
						? m.content
								.filter(
									(p: Record<string, unknown>) => p?.type === "text",
								)
								.map((p: Record<string, unknown>) => p.text)
								.join("")
						: String(m.content ?? "");

			if (m.role === "system") {
				instructions = text;
			} else {
				input.push({ role: m.role, content: text });
			}
		}
	}

	const req: Record<string, unknown> = {
		model: body.model,
		instructions,
		input,
		store: false,
		stream: body.stream === true,
	};

	if (body.temperature != null) req.temperature = body.temperature;
	if (body.top_p != null) req.top_p = body.top_p;
	if (body.max_tokens != null) req.max_output_tokens = body.max_tokens;

	return req;
}

// ─── Response: Responses API → Chat Completions (non-streaming) ──

export function toOpenAIResponse(
	raw: Record<string, unknown>,
	model: string,
): Record<string, unknown> {
	const output = raw.output as Record<string, unknown>[] | undefined;
	let text = "";
	for (const item of output ?? []) {
		if (item.type !== "message") continue;
		const content = item.content as Record<string, unknown>[] | undefined;
		for (const part of content ?? []) {
			if (part.type === "output_text") text += part.text ?? "";
		}
	}

	const usage = raw.usage as Record<string, unknown> | undefined;
	const mapped = usage
		? {
				prompt_tokens: usage.input_tokens as number,
				completion_tokens: usage.output_tokens as number,
				total_tokens: (usage.total_tokens as number) ?? 0,
			}
		: undefined;

	return {
		id: `chatcmpl-${(raw.id as string) ?? crypto.randomUUID()}`,
		object: "chat.completion",
		created: (raw.created_at as number) ?? Math.floor(Date.now() / 1000),
		model,
		choices: [
			{
				index: 0,
				message: { role: "assistant", content: text },
				finish_reason: "stop",
			},
		],
		...(mapped && { usage: mapped }),
	};
}

// ─── Streaming: Responses SSE → Chat Completions SSE ────────

/**
 * TransformStream that converts Responses API SSE events to
 * OpenAI Chat Completions SSE chunks, terminated with `data: [DONE]`.
 *
 * Relevant upstream events:
 *   response.output_text.delta  → delta content
 *   response.completed          → final usage
 */
export function createResponsesToOpenAIStream(
	model: string,
): TransformStream<Uint8Array, Uint8Array> {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const chatId = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
	const created = Math.floor(Date.now() / 1000);
	let buffer = "";
	let sentRole = false;

	function emit(
		controller: TransformStreamDefaultController<Uint8Array>,
		delta: Record<string, string>,
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
		if (usage) {
			chunk.usage = {
				prompt_tokens: usage.input_tokens,
				completion_tokens: usage.output_tokens,
				total_tokens: usage.total_tokens ?? 0,
			};
		}
		controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
	}

	return new TransformStream({
		transform(chunk, controller) {
			buffer += decoder.decode(chunk, { stream: true });

			while (true) {
				const end = buffer.indexOf("\n\n");
				if (end === -1) break;

				const frame = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);

				let eventType = "";
				let dataStr = "";
				for (const line of frame.split("\n")) {
					if (line.startsWith("event: ")) eventType = line.slice(7).trim();
					else if (line.startsWith("data: ")) dataStr = line.slice(6);
				}

				if (!dataStr) continue;
				let data: Record<string, unknown>;
				try {
					data = JSON.parse(dataStr);
				} catch {
					continue;
				}

				if (eventType === "response.output_text.delta") {
					const delta: Record<string, string> = {};
					if (!sentRole) {
						delta.role = "assistant";
						sentRole = true;
					}
					const text = data.delta as string | undefined;
					if (text) delta.content = text;
					emit(controller, delta, null);
				} else if (eventType === "response.completed") {
					const resp = data.response as Record<string, unknown> | undefined;
					const usage = resp?.usage as Record<string, unknown> | undefined;
					emit(controller, {}, "stop", usage);
				}
			}
		},
		flush(controller) {
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
		},
	});
}

/**
 * Gemini Native Protocol Converter (OpenAI ↔ Google v1internal)
 *
 * Reusable across any adapter that speaks Google's Gemini protocol:
 * Gemini CLI (cloudcode-pa), Antigravity IDE, future Google services.
 */

// ─── Types ──────────────────────────────────────────────

interface GeminiPart {
	text: string;
}

interface GeminiContent {
	role: "user" | "model";
	parts: GeminiPart[];
}

// ─── Request: OpenAI → Gemini ───────────────────────────

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return String(content ?? "");
	return content
		.filter((p) => p?.type === "text")
		.map((p) => p.text)
		.join("");
}

export function toGeminiRequest(
	body: Record<string, unknown>,
	projectId: string,
): Record<string, unknown> {
	const messages = body.messages as { role: string; content: unknown }[];

	const systemParts: GeminiPart[] = [];
	const contents: GeminiContent[] = [];

	for (const m of messages) {
		if (m.role === "system") {
			systemParts.push({ text: extractText(m.content) });
		} else {
			contents.push({
				role: m.role === "assistant" ? "model" : "user",
				parts: [{ text: extractText(m.content) }],
			});
		}
	}

	const request: Record<string, unknown> = { contents };

	if (systemParts.length > 0) {
		request.systemInstruction = { parts: systemParts };
	}

	const gen: Record<string, unknown> = {};
	if (body.temperature != null) gen.temperature = body.temperature;
	if (body.top_p != null) gen.topP = body.top_p;
	if (body.max_tokens != null) gen.maxOutputTokens = body.max_tokens;
	if (Object.keys(gen).length > 0) request.generationConfig = gen;

	const rawModel = body.model as string;
	const model = rawModel.replace(/^[^/]+\//, "");
	return { model, project: projectId, request };
}

// ─── Response: Gemini → OpenAI ──────────────────────────

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

function mapUsage(
	meta: Record<string, number> | undefined,
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

function extractCandidate(resp: Record<string, unknown>): {
	text: string;
	finishReason: string | null;
	usage: ReturnType<typeof mapUsage>;
} {
	const response = resp.response as Record<string, unknown> | undefined;
	const candidates = response?.candidates as
		| Record<string, unknown>[]
		| undefined;
	const c = candidates?.[0];
	const content = c?.content as { parts?: { text?: string }[] } | undefined;
	const text = content?.parts?.map((p) => p.text ?? "").join("") ?? "";
	return {
		text,
		finishReason: mapFinishReason(c?.finishReason as string | undefined),
		usage: mapUsage(
			response?.usageMetadata as Record<string, number> | undefined,
		),
	};
}

/** Convert a Gemini JSON response (non-streaming) to OpenAI chat.completion.
 *  Handles both single objects (generateContent) and arrays (streamGenerateContent without alt=sse). */
export function toOpenAIResponse(
	raw: unknown,
	model: string,
): Record<string, unknown> {
	const chunks = Array.isArray(raw) ? raw : [raw];
	const parts: string[] = [];
	let lastFinishReason: string | null = null;
	let lastUsage: ReturnType<typeof mapUsage>;
	let responseId: string | undefined;

	for (const chunk of chunks) {
		const { text, finishReason, usage } = extractCandidate(chunk);
		if (text) parts.push(text);
		if (finishReason) lastFinishReason = finishReason;
		if (usage) lastUsage = usage;
		responseId ??=
			(chunk?.response as Record<string, unknown>)?.responseId as string;
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

// ─── Streaming: Gemini SSE → OpenAI SSE ─────────────────

/**
 * Creates a TransformStream that converts Gemini SSE frames to OpenAI SSE frames.
 * Input: raw bytes from `cloudcode-pa…?alt=sse`
 * Output: OpenAI-format SSE with `data: [DONE]` terminator
 */
export function createGeminiToOpenAIStream(
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
			buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");

			while (true) {
				const end = buffer.indexOf("\n\n");
				if (end === -1) break;

				const frame = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);

				for (const line of frame.split("\n")) {
					const trimmed = line.trim();
					if (!trimmed.startsWith("data: ")) continue;

					let parsed: Record<string, unknown>;
					try {
						parsed = JSON.parse(trimmed.substring(6));
					} catch {
						continue;
					}

					const { text, finishReason, usage } = extractCandidate(parsed);

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

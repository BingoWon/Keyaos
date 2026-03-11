import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	type UIMessage,
} from "ai";
import { Hono } from "hono";
import { ThreadsDao } from "../core/db/threads-dao";
import { BadRequestError } from "../shared/errors";
import { log } from "../shared/logger";
import type { AppEnv } from "../shared/types";
import { executeCompletion } from "./gateway";

const assistantRouter = new Hono<AppEnv>();

assistantRouter.post("/", async (c) => {
	let body: Record<string, unknown>;
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body", "invalid_json");
	}

	const messages = body.messages as UIMessage[] | undefined;
	const modelId = body.model_id as string | undefined;
	const system = body.system as string | undefined;
	const threadId = (body.id ?? body.threadId) as string | undefined;
	const providerIds = body.provider_ids as string[] | undefined;

	if (!modelId)
		throw new BadRequestError("model_id is required", "model_required");
	if (!messages?.length)
		throw new BadRequestError("messages required", "messages_required");

	type ContentPart =
		| { type: "text"; text: string }
		| { type: "image_url"; image_url: { url: string } };

	const openaiMessages: {
		role: string;
		content: string | ContentPart[];
	}[] = [];
	if (system) openaiMessages.push({ role: "system", content: system });

	for (const m of messages) {
		if (!Array.isArray(m.parts)) continue;
		const parts: ContentPart[] = [];
		for (const p of m.parts) {
			if (p.type === "text" && (p as { text?: string }).text) {
				parts.push({ type: "text", text: (p as { text: string }).text });
			} else if (
				p.type === "file" &&
				(p as { url?: string }).url &&
				(p as { mediaType?: string }).mediaType?.startsWith("image/")
			) {
				parts.push({
					type: "image_url",
					image_url: { url: (p as { url: string }).url },
				});
			}
		}
		if (!parts.length) continue;
		const textOnly = parts.every((cp) => cp.type === "text");
		openaiMessages.push({
			role: m.role,
			content: textOnly
				? (parts as { type: "text"; text: string }[])
						.map((cp) => cp.text)
						.join("")
				: parts,
		});
	}

	log.info("assistant", "Request", {
		modelId,
		msgs: openaiMessages.length,
		threadId,
	});

	const ownerId = c.get("owner_id");
	const partId = crypto.randomUUID();
	let fullResponseText = "";

	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			let result: Awaited<ReturnType<typeof executeCompletion>>;
			try {
				result = await executeCompletion(c, {
					modelId,
					body: { messages: openaiMessages, stream: true },
					providerIds,
				});
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : "Unknown gateway error";
				log.error("assistant", "Gateway error", { error: msg, modelId });
				writer.write({ type: "error", errorText: msg });
				return;
			}

			const upstream = result.response;
			log.info("assistant", "Streaming", {
				providerId: result.providerId,
				reqId: result.requestId,
			});

			if (!upstream.body) {
				writer.write({ type: "error", errorText: "Empty upstream body" });
				return;
			}

			writer.write({ type: "text-start", id: partId });

			const reader = upstream.body.getReader();
			const decoder = new TextDecoder();
			let buf = "";

			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;

				buf += decoder.decode(value, { stream: true });
				const lines = buf.split("\n");
				buf = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const payload = line.slice(6).trim();
					if (payload === "[DONE]") continue;

					try {
						const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
						if (delta) {
							fullResponseText += delta;
							writer.write({ type: "text-delta", delta, id: partId });
						}
					} catch (parseErr) {
						log.warn("assistant", "SSE chunk parse error", {
							payload: payload.slice(0, 200),
							error:
								parseErr instanceof Error ? parseErr.message : String(parseErr),
						});
					}
				}
			}

			writer.write({ type: "text-end", id: partId });
			writer.write({ type: "finish-step" });
			writer.write({ type: "finish", finishReason: "stop" });

			if (threadId && fullResponseText) {
				const lastUserMsg = messages?.[messages.length - 1];
				c.executionCtx.waitUntil(
					(async () => {
						try {
							const dao = new ThreadsDao(c.env.DB);
							if (lastUserMsg?.role === "user") {
								await dao.addMessage({
									id: lastUserMsg.id || `msg_${crypto.randomUUID()}`,
									thread_id: threadId,
									role: "user",
									content: JSON.stringify(lastUserMsg.parts ?? []),
									model_id: null,
									created_at: Date.now(),
								});
							}
							await dao.addMessage({
								id: `msg_${crypto.randomUUID()}`,
								thread_id: threadId,
								role: "assistant",
								content: JSON.stringify([
									{ type: "text", text: fullResponseText },
								]),
								model_id: modelId,
								created_at: Date.now(),
							});
							if (modelId) await dao.updateModel(threadId, ownerId, modelId);
						} catch (err) {
							log.error("assistant", "Failed to save messages", {
								threadId,
								error: err instanceof Error ? err.message : String(err),
							});
						}
					})(),
				);
			}
		},
		onError: (error) => {
			const msg = error instanceof Error ? error.message : String(error);
			log.error("assistant", "Stream error", { error: msg });
			return msg;
		},
	});

	return createUIMessageStreamResponse({ stream });
});

export default assistantRouter;

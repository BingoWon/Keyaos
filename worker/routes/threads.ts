import { Hono } from "hono";
import { ThreadsDao } from "../core/db/threads-dao";
import { BadRequestError } from "../shared/errors";
import { log } from "../shared/logger";
import type { AppEnv } from "../shared/types";
import { executeCompletion } from "./gateway";

const threadsRouter = new Hono<AppEnv>();

threadsRouter.get("/", async (c) => {
	const ownerId = c.get("owner_id");
	const dao = new ThreadsDao(c.env.DB);
	const { threads } = await dao.list(ownerId);
	return c.json({
		threads: threads.map((t) => ({
			remoteId: t.id,
			status: t.status,
			title: t.title,
			model_id: t.model_id,
			updated_at: t.updated_at,
		})),
	});
});

threadsRouter.post("/", async (c) => {
	const ownerId = c.get("owner_id");
	const body = await c.req.json<{ threadId?: string }>();
	const id = body.threadId || `thread_${crypto.randomUUID()}`;
	const now = Date.now();
	const dao = new ThreadsDao(c.env.DB);
	await dao.create({
		id,
		owner_id: ownerId,
		title: null,
		model_id: null,
		status: "regular",
		created_at: now,
		updated_at: now,
	});
	return c.json({ remoteId: id, externalId: undefined });
});

threadsRouter.get("/:id", async (c) => {
	const ownerId = c.get("owner_id");
	const id = c.req.param("id");
	const dao = new ThreadsDao(c.env.DB);
	const thread = await dao.get(id, ownerId);
	if (!thread) return c.json({ error: "Not found" }, 404);
	return c.json({
		remoteId: thread.id,
		status: thread.status,
		title: thread.title,
		model_id: thread.model_id,
	});
});

threadsRouter.patch("/:id/rename", async (c) => {
	const ownerId = c.get("owner_id");
	const id = c.req.param("id");
	const { title } = await c.req.json<{ title: string }>();
	if (!title) throw new BadRequestError("title required", "title_required");
	const dao = new ThreadsDao(c.env.DB);
	await dao.updateTitle(id, ownerId, title);
	return c.json({ ok: true });
});

threadsRouter.patch("/:id/archive", async (c) => {
	const ownerId = c.get("owner_id");
	const id = c.req.param("id");
	const dao = new ThreadsDao(c.env.DB);
	await dao.updateStatus(id, ownerId, "archived");
	return c.json({ ok: true });
});

threadsRouter.patch("/:id/unarchive", async (c) => {
	const ownerId = c.get("owner_id");
	const id = c.req.param("id");
	const dao = new ThreadsDao(c.env.DB);
	await dao.updateStatus(id, ownerId, "regular");
	return c.json({ ok: true });
});

threadsRouter.delete("/:id", async (c) => {
	const ownerId = c.get("owner_id");
	const id = c.req.param("id");
	const dao = new ThreadsDao(c.env.DB);
	await dao.delete(id, ownerId);
	return c.json({ ok: true });
});

threadsRouter.get("/:id/messages", async (c) => {
	const threadId = c.req.param("id");
	const dao = new ThreadsDao(c.env.DB);
	const messages = await dao.getMessages(threadId);
	return c.json({
		messages: messages.map((m) => {
			let parts: unknown[];
			try {
				parts = JSON.parse(m.content);
			} catch {
				log.error("threads", "Corrupt message content", {
					threadId,
					messageId: m.id,
					contentPreview: m.content.slice(0, 100),
				});
				parts = [{ type: "text", text: "[corrupted message]" }];
			}
			return {
				id: m.id,
				role: m.role,
				parts,
				createdAt: new Date(m.created_at).toISOString(),
			};
		}),
	});
});

threadsRouter.post("/:id/generate-title", async (c) => {
	const ownerId = c.get("owner_id");
	const threadId = c.req.param("id");
	const body = await c.req.json<{
		messages: { role: string; content: string }[];
		model_id?: string;
	}>();

	const snippet = (body.messages ?? [])
		.filter((m) => m.role === "user" || m.role === "assistant")
		.slice(0, 4)
		.map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
		.join("\n");

	if (!snippet) {
		log.info("threads", "generate-title: empty snippet, skipping", {
			threadId,
		});
		return c.json({ title: "New Thread" });
	}

	if (!body.model_id) {
		log.warn("threads", "generate-title: no model provided", { threadId });
		return c.json({ title: "New Thread" });
	}

	const titleModel = body.model_id;

	let result: Awaited<ReturnType<typeof executeCompletion>>;
	try {
		result = await executeCompletion(c, {
			modelId: titleModel,
			body: {
				messages: [
					{
						role: "system",
						content:
							"Generate a concise title (max 6 words) for this conversation. Reply with ONLY the title, no quotes, no line breaks.",
					},
					{ role: "user", content: snippet },
				],
				stream: false,
				max_tokens: 30,
			},
		});
	} catch (err) {
		log.error("threads", "generate-title: gateway FAILED", {
			threadId,
			modelId: titleModel,
			error: err instanceof Error ? err.message : String(err),
		});
		return c.json({ title: "New Thread" });
	}

	let title = "New Thread";
	try {
		const json = (await result.response.json()) as {
			choices?: { message?: { content?: string } }[];
		};
		const content = json.choices?.[0]?.message?.content?.trim();
		if (content) title = content.replace(/[\n\r]+/g, " ");
	} catch (err) {
		log.warn("threads", "generate-title: parse failed", {
			threadId,
			error: err instanceof Error ? err.message : String(err),
		});
	}

	log.info("threads", "generate-title: success", {
		threadId,
		title,
		modelId: titleModel,
	});

	c.executionCtx.waitUntil(
		(async () => {
			try {
				const dao = new ThreadsDao(c.env.DB);
				await dao.updateTitle(threadId, ownerId, title);
			} catch (err) {
				log.error("threads", "generate-title: DB save failed", {
					threadId,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		})(),
	);

	return c.json({ title });
});

threadsRouter.post("/:id/messages", async (c) => {
	const threadId = c.req.param("id");
	const body = await c.req.json<{
		messages: { id: string; role: string; parts: unknown; model?: string }[];
	}>();
	if (!body.messages?.length)
		throw new BadRequestError("messages required", "messages_required");
	const dao = new ThreadsDao(c.env.DB);
	const now = Date.now();
	for (const m of body.messages) {
		await dao.addMessage({
			id: m.id,
			thread_id: threadId,
			role: m.role,
			content: JSON.stringify(m.parts),
			model_id: m.model ?? null,
			created_at: now,
		});
	}
	return c.json({ ok: true });
});

export default threadsRouter;

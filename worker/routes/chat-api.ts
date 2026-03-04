import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { Hono } from "hono";
import { BadRequestError } from "../shared/errors";
import type { AppEnv } from "../shared/types";

const chatApiRouter = new Hono<AppEnv>();

chatApiRouter.post("/", async (c) => {
	let body: Record<string, unknown>;
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	const messages = body.messages as UIMessage[] | undefined;
	const modelId = body.model as string | undefined;
	const system = body.system as string | undefined;

	if (!modelId) throw new BadRequestError("model is required");
	if (!messages?.length) throw new BadRequestError("messages is required");

	const authHeader = c.req.header("Authorization") || "";
	const origin = new URL(c.req.url).origin;

	const openai = createOpenAI({
		baseURL: `${origin}/v1`,
		apiKey: "internal",
		headers: { Authorization: authHeader },
	});

	const result = streamText({
		model: openai(modelId),
		messages: await convertToModelMessages(messages),
		system,
	});

	return result.toUIMessageStreamResponse();
});

export default chatApiRouter;

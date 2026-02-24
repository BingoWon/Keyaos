/**
 * Anthropic Messages API — POST /v1/messages
 *
 * Accepts Anthropic-format requests, converts internally to OpenAI format,
 * executes via the shared gateway, then converts the response back.
 */

import { Hono } from "hono";
import {
	createOpenAIToAnthropicStream,
	toAnthropicResponse,
	toOpenAIRequest,
} from "../core/protocols/anthropic";
import { ApiError, BadRequestError } from "../shared/errors";
import type { AppEnv } from "../shared/types";
import { executeCompletion } from "./gateway";

const messagesRouter = new Hono<AppEnv>();

messagesRouter.onError((err, c) => {
	if (err instanceof ApiError) {
		return c.json(
			{ type: "error", error: { type: err.type, message: err.message } },
			err.statusCode as 400,
		);
	}
	console.error("[MESSAGES] Unhandled:", err);
	return c.json(
		{
			type: "error",
			error: { type: "api_error", message: "Internal server error" },
		},
		500,
	);
});

messagesRouter.post("/", async (c) => {
	let body: Record<string, unknown>;
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	const model = body.model as string;
	if (!model) throw new BadRequestError("model is required");
	if (!body.max_tokens) throw new BadRequestError("max_tokens is required");

	const { provider: rawProvider, ...rest } = body;
	const providers = rawProvider
		? Array.isArray(rawProvider)
			? (rawProvider as string[])
			: [rawProvider as string]
		: undefined;

	const openaiBody = toOpenAIRequest(rest);
	const result = await executeCompletion(c, {
		model,
		body: openaiBody,
		providers,
	});

	const meta = {
		"x-request-id": result.requestId,
		"x-provider": result.provider,
		"x-credential-id": result.credentialId,
	};

	const contentType = result.response.headers.get("content-type") || "";

	if (contentType.includes("text/event-stream")) {
		if (!result.response.body) return c.text("", 502);

		return new Response(
			result.response.body.pipeThrough(createOpenAIToAnthropicStream(model)),
			{
				status: 200,
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					...meta,
				},
			},
		);
	}

	const openaiJson = (await result.response.json()) as Record<string, unknown>;
	return new Response(JSON.stringify(toAnthropicResponse(openaiJson, model)), {
		status: 200,
		headers: { "Content-Type": "application/json", ...meta },
	});
});

export default messagesRouter;

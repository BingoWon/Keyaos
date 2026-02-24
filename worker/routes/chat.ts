import { Hono } from "hono";
import { BadRequestError } from "../shared/errors";
import type { AppEnv } from "../shared/types";
import { executeCompletion } from "./gateway";

const chatRouter = new Hono<AppEnv>();

chatRouter.post("/completions", async (c) => {
	let body: Record<string, unknown>;
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	const model = body.model as string;
	if (!model) throw new BadRequestError("model is required");

	const { provider: rawProvider, ...rest } = body;
	const providers = rawProvider
		? Array.isArray(rawProvider)
			? (rawProvider as string[])
			: [rawProvider as string]
		: undefined;

	const result = await executeCompletion(c, { model, body: rest, providers });

	result.response.headers.set("x-request-id", result.requestId);
	result.response.headers.set("x-provider", result.provider);
	result.response.headers.set("x-credential-id", result.credentialId);
	return result.response;
});

export default chatRouter;

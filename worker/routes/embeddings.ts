import { Hono } from "hono";
import { BadRequestError } from "../shared/errors";
import type { AppEnv } from "../shared/types";
import { executeEmbedding } from "./gateway";

const embeddingsRouter = new Hono<AppEnv>();

embeddingsRouter.post("/", async (c) => {
	let body: Record<string, unknown>;
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	const modelId = body.model as string;
	if (!modelId) throw new BadRequestError("model is required");
	if (!body.input) throw new BadRequestError("input is required");

	const { provider: rawProvider, ...rest } = body;
	const providerIds = rawProvider
		? Array.isArray(rawProvider)
			? (rawProvider as string[])
			: [rawProvider as string]
		: undefined;

	const result = await executeEmbedding(c, {
		modelId,
		body: rest,
		providerIds,
	});

	result.response.headers.set("x-request-id", result.requestId);
	result.response.headers.set("x-provider", result.providerId);
	result.response.headers.set("x-credential-id", result.credentialId);

	return result.response;
});

export default embeddingsRouter;

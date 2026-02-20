import { Hono } from "hono";
import { recordUsage } from "../core/billing";
import { KeysDao } from "../core/db/keys-dao";
import { dispatch } from "../core/dispatcher";
import { interceptResponse } from "../core/utils/stream";
import type { Env } from "../index";
import { ApiError, BadRequestError } from "../shared/errors";

const chatRouter = new Hono<{ Bindings: Env }>();

chatRouter.post("/completions", async (c) => {
	let body: Record<string, unknown>;
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	const model = body.model as string;
	if (!model) throw new BadRequestError("model is required");

	const { key, provider, upstreamModel, modelCost } = await dispatch(
		c.env.DB,
		model,
	);

	const keysDao = new KeysDao(c.env.DB);

	const upstreamBody = {
		...body,
		model: upstreamModel,
		stream_options: body.stream ? { include_usage: true } : undefined,
	};

	try {
		const response = await provider.forwardRequest(
			key.api_key,
			c.req.raw,
			upstreamBody,
		);

		const finalResponse = interceptResponse(
			response,
			c.executionCtx,
			(usage) => {
				c.executionCtx.waitUntil(
					recordUsage(c.env.DB, {
						keyId: key.id,
						provider: key.provider,
						model: upstreamModel,
						modelCost,
						usage,
					}).catch((err) => console.error("[BILLING] waitUntil failed:", err)),
				);
			},
		);

		await keysDao.reportSuccess(key.id);
		return finalResponse;
	} catch (err) {
		const statusCode = err instanceof ApiError ? err.statusCode : 500;
		await keysDao.reportFailure(key.id, statusCode);
		throw err;
	}
});

export default chatRouter;

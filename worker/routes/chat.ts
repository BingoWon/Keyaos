import { Hono } from "hono";
import { recordTransactionTx } from "../core/billing";
import { Config } from "../core/config";
import { dispatch } from "../core/dispatcher";
import { KeyPoolService } from "../core/key-pool";
import { interceptResponse } from "../core/utils/stream";
import type { Env } from "../index";
import { ApiError, BadRequestError } from "../shared/errors";

const chatRouter = new Hono<{ Bindings: Env }>();

chatRouter.post("/completions", async (c) => {
	const keyPool = new KeyPoolService(c.env.DB);
	let body: Record<string, unknown>;
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	const model = body.model as string;
	if (!model) throw new BadRequestError("model is required");

	const { key, provider, upstreamModel } = await dispatch(c.env.DB, model);

	const upstreamBody = {
		...body,
		model: upstreamModel,
		stream_options: body.stream ? { include_usage: true } : undefined,
	};

	try {
		const response = await provider.forwardRequest(
			key.api_key_encrypted,
			c.req.raw,
			upstreamBody,
		);

		const finalResponse = interceptResponse(
			response,
			c.executionCtx,
			(usage) => {
				c.executionCtx.waitUntil(
					recordTransactionTx(c.env.DB, {
						buyerId: Config.ADMIN_MOCK_USER_ID,
						keyId: key.id,
						provider: key.provider,
						model: upstreamModel,
						usage,
					}).catch((err) =>
						console.error("[BILLING] waitUntil Promise FAILED:", err),
					),
				);
			},
		);

		await keyPool.reportSuccess(key.id);
		return finalResponse;
	} catch (err) {
		const statusCode = err instanceof ApiError ? err.statusCode : 500;
		await keyPool.reportFailure(key.id, statusCode);
		throw err;
	}
});

export default chatRouter;

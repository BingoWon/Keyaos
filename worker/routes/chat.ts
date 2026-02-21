import { Hono } from "hono";
import { recordUsage } from "../core/billing";
import { ListingsDao } from "../core/db/listings-dao";
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

	const { listing, provider, upstreamModel, modelCost } = await dispatch(
		c.env.DB,
		model,
	);

	const listingsDao = new ListingsDao(c.env.DB);

	const upstreamBody = {
		...body,
		model: upstreamModel,
		stream_options: body.stream ? { include_usage: true } : undefined,
	};

	try {
		const response = await provider.forwardRequest(
			listing.api_key,
			c.req.raw,
			upstreamBody,
		);

		const finalResponse = interceptResponse(
			response,
			c.executionCtx,
			(usage) => {
				c.executionCtx.waitUntil(
					recordUsage(c.env.DB, {
						listingId: listing.id,
						provider: listing.provider,
						model: upstreamModel,
						modelCost,
						usage,
					}).catch((err) => console.error("[BILLING] waitUntil failed:", err)),
				);
			},
		);

		await listingsDao.reportSuccess(listing.id);
		return finalResponse;
	} catch (err) {
		const statusCode = err instanceof ApiError ? err.statusCode : 500;
		await listingsDao.reportFailure(listing.id, statusCode);
		throw err;
	}
});

export default chatRouter;

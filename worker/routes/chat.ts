import { Hono } from "hono";
import { recordUsage } from "../core/billing";
import { QuotasDao } from "../core/db/quotas-dao";
import { dispatch } from "../core/dispatcher";
import { interceptResponse } from "../core/utils/stream";
import type { Env } from "../index";
import { ApiError, BadRequestError } from "../shared/errors";

const chatRouter = new Hono<{ Bindings: Env; Variables: { owner_id: string } }>();

chatRouter.post("/completions", async (c) => {
	let body: Record<string, unknown>;
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	const model = body.model as string;
	if (!model) throw new BadRequestError("model is required");

	const owner_id = c.get("owner_id");

	const { listing, provider, upstreamModel, modelPrice } = await dispatch(
		c.env.DB,
		model,
		owner_id,
	);

	const quotasDao = new QuotasDao(c.env.DB);

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
						ownerId: owner_id,
						listingId: listing.id,
						provider: listing.provider,
						model: upstreamModel,
						modelPrice,
						usage,
					}).catch((err) => console.error("[BILLING] waitUntil failed:", err)),
				);
			},
		);

		await quotasDao.reportSuccess(listing.id);
		return finalResponse;
	} catch (err) {
		const statusCode = err instanceof ApiError ? err.statusCode : 500;
		await quotasDao.reportFailure(listing.id, statusCode);
		throw err;
	}
});

export default chatRouter;

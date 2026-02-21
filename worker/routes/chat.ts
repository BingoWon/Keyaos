import { Hono } from "hono";
import { recordUsage } from "../core/billing";
import { UpstreamKeysDao } from "../core/db/upstream-keys-dao";
import { dispatchAll } from "../core/dispatcher";
import { interceptResponse } from "../core/utils/stream";
import { BadRequestError, NoKeyAvailableError } from "../shared/errors";
import type { AppEnv } from "../shared/types";

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

	const owner_id = c.get("owner_id");
	const candidates = await dispatchAll(c.env.DB, model, owner_id);
	const keysDao = new UpstreamKeysDao(c.env.DB);

	let lastError: unknown;

	for (const {
		upstreamKey,
		provider,
		upstreamModel,
		modelPrice,
	} of candidates) {
		const upstreamBody = {
			...body,
			model: upstreamModel,
			stream_options: body.stream ? { include_usage: true } : undefined,
		};

		try {
			const response = await provider.forwardRequest(
				upstreamKey.api_key,
				upstreamBody,
			);

			if (!response.ok) {
				await keysDao.reportFailure(upstreamKey.id, response.status);
				lastError = new Error(
					`Upstream ${provider.info.id} returned ${response.status}`,
				);
				continue;
			}

			const finalResponse = interceptResponse(response, c.executionCtx, {
				onUsage: (usage) => {
					c.executionCtx.waitUntil(
						recordUsage(c.env.DB, {
							ownerId: owner_id,
							upstreamKeyId: upstreamKey.id,
							provider: upstreamKey.provider,
							model: upstreamModel,
							modelPrice,
							usage,
						}).catch((err) =>
							console.error("[BILLING] waitUntil failed:", err),
						),
					);
				},
				onStreamDone: () => {
					c.executionCtx.waitUntil(keysDao.reportSuccess(upstreamKey.id));
				},
				onStreamError: () => {
					c.executionCtx.waitUntil(keysDao.reportFailure(upstreamKey.id));
				},
			});

			return finalResponse;
		} catch (err) {
			await keysDao.reportFailure(upstreamKey.id);
			lastError = err;
		}
	}

	if (lastError) console.error("[CHAT] All candidates exhausted:", lastError);
	throw new NoKeyAvailableError(model);
});

export default chatRouter;

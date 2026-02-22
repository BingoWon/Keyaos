import { Hono } from "hono";
import { recordUsage } from "../core/billing";
import { CredentialsDao } from "../core/db/credentials-dao";
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

	const rawProvider = body.provider as string | string[] | undefined;
	const providers = rawProvider
		? Array.isArray(rawProvider)
			? rawProvider
			: [rawProvider]
		: undefined;

	const owner_id = c.get("owner_id");
	const candidates = await dispatchAll(c.env.DB, model, owner_id, providers);
	const credDao = new CredentialsDao(c.env.DB);

	let lastError: unknown;

	for (const { credential, provider, modelId, modelPrice } of candidates) {
		const upstreamBody = {
			...body,
			model: modelId,
			stream_options: body.stream ? { include_usage: true } : undefined,
		};

		try {
			const response = await provider.forwardRequest(
				credential.secret,
				upstreamBody,
			);

			if (!response.ok) {
				await credDao.reportFailure(credential.id, response.status);
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
							credentialId: credential.id,
							provider: credential.provider,
							model: modelId,
							modelPrice,
							usage,
						}).catch((err) =>
							console.error("[BILLING] waitUntil failed:", err),
						),
					);
				},
				onStreamDone: () => {
					c.executionCtx.waitUntil(credDao.reportSuccess(credential.id));
				},
				onStreamError: () => {
					c.executionCtx.waitUntil(credDao.reportFailure(credential.id));
				},
			});

			return finalResponse;
		} catch (err) {
			await credDao.reportFailure(credential.id);
			lastError = err;
		}
	}

	if (lastError) console.error("[CHAT] All candidates exhausted:", lastError);
	throw new NoKeyAvailableError(model);
});

export default chatRouter;

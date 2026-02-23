import { Hono } from "hono";
import { calculateBaseCost, recordUsage } from "../core/billing";
import { CredentialsDao } from "../core/db/credentials-dao";
import { dispatchAll } from "../core/dispatcher";
import { interceptResponse } from "../core/utils/stream";
import {
	calculateSettlement,
	settleWallets,
} from "../platform/billing/settlement";
import { WalletDao } from "../platform/billing/wallet-dao";
import {
	BadRequestError,
	InsufficientCreditsError,
	NoKeyAvailableError,
} from "../shared/errors";
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

	const { provider: rawProvider, ...rest } = body;
	const providers = rawProvider
		? Array.isArray(rawProvider)
			? (rawProvider as string[])
			: [rawProvider as string]
		: undefined;

	const consumerId = c.get("owner_id");
	const isPlatform = !!c.env.CLERK_SECRET_KEY;

	if (isPlatform) {
		const balance = await new WalletDao(c.env.DB).getBalance(consumerId);
		if (balance <= 0) throw new InsufficientCreditsError();
	}

	const poolOwnerId = isPlatform ? undefined : consumerId;
	const candidates = await dispatchAll(c.env.DB, model, poolOwnerId, providers);
	const credDao = new CredentialsDao(c.env.DB);

	let lastError: unknown;

	for (const { credential, provider, modelId, modelPrice } of candidates) {
		const isSub = provider.info.isSubscription ?? false;
		const upstreamBody = {
			...rest,
			model: modelId,
			stream_options: rest.stream ? { include_usage: true } : undefined,
		};

		try {
			const response = await provider.forwardRequest(
				credential.secret,
				upstreamBody,
			);

			if (!response.ok) {
				await credDao.reportFailure(credential.id, response.status, isSub);
				lastError = new Error(
					`Upstream ${provider.info.id} returned ${response.status}`,
				);
				continue;
			}

			const requestId = crypto.randomUUID();
			const credentialOwnerId = credential.owner_id;
			const isSelfUse = consumerId === credentialOwnerId;

			const finalResponse = interceptResponse(response, c.executionCtx, {
				onUsage: (usage) => {
					c.executionCtx.waitUntil(
						(async () => {
							const baseCost = calculateBaseCost(modelPrice, usage);
							const settlement = isPlatform
								? calculateSettlement(baseCost, isSelfUse)
								: { consumerCharged: 0, providerEarned: 0, platformFee: 0 };

							await recordUsage(c.env.DB, {
								consumerId,
								credentialId: credential.id,
								credentialOwnerId,
								provider: credential.provider,
								model: modelId,
								modelPrice,
								usage,
								settlement,
							});

							if (isPlatform && !isSelfUse) {
								await settleWallets(
									c.env.DB,
									consumerId,
									credentialOwnerId,
									settlement,
								);
							}
						})().catch((err) =>
							console.error("[BILLING] waitUntil failed:", err),
						),
					);
				},
				onStreamDone: () => {
					c.executionCtx.waitUntil(credDao.reportSuccess(credential.id));
				},
				onStreamError: () => {
					c.executionCtx.waitUntil(
						credDao.reportFailure(credential.id, undefined, isSub),
					);
				},
			});

			finalResponse.headers.set("x-request-id", requestId);
			finalResponse.headers.set("x-provider", credential.provider);
			finalResponse.headers.set("x-credential-id", credential.id);
			return finalResponse;
		} catch (err) {
			await credDao.reportFailure(credential.id, undefined, isSub);
			lastError = err;
		}
	}

	if (lastError) console.error("[CHAT] All candidates exhausted:", lastError);
	throw new NoKeyAvailableError(model);
});

export default chatRouter;

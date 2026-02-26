/**
 * Gateway — Shared completion execution with dispatch, retry, and billing.
 *
 * Both OpenAI (/v1/chat/completions) and Anthropic (/v1/messages) routes
 * delegate here for the core forward-and-bill loop.
 *
 * Lives in routes/ (not core/) because it depends on platform/ billing.
 */

import type { Context } from "hono";
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
	InsufficientCreditsError,
	NoKeyAvailableError,
} from "../shared/errors";
import { requestLogger } from "../shared/logger";
import type { AppEnv } from "../shared/types";

export interface CompletionRequest {
	model: string;
	body: Record<string, unknown>;
	providers?: string[];
}

export interface CompletionResult {
	response: Response;
	requestId: string;
	provider: string;
	credentialId: string;
}

export async function executeCompletion(
	c: Context<AppEnv>,
	req: CompletionRequest,
): Promise<CompletionResult> {
	const consumerId = c.get("owner_id");
	const isPlatform = !!c.env.CLERK_SECRET_KEY;
	const requestId = crypto.randomUUID();
	const rlog = requestLogger(requestId, { model: req.model, consumerId });

	if (isPlatform) {
		const balance = await new WalletDao(c.env.DB).getBalance(consumerId);
		if (balance <= 0) throw new InsufficientCreditsError();
	}

	const poolOwnerId = isPlatform ? undefined : consumerId;
	const candidates = await dispatchAll(
		c.env.DB,
		req.model,
		poolOwnerId,
		req.providers,
	);
	const credDao = new CredentialsDao(c.env.DB);

	rlog.info("gateway", "Dispatching", { candidates: candidates.length });

	let lastError: unknown;

	for (let attempt = 0; attempt < candidates.length; attempt++) {
		const { credential, provider, modelId, modelPrice } = candidates[attempt];
		const isSub = provider.info.isSubscription ?? false;
		const upstreamBody = {
			...req.body,
			model: modelId,
			stream_options: req.body.stream ? { include_usage: true } : undefined,
		};

		try {
			const t0 = Date.now();
			const response = await provider.forwardRequest(
				credential.secret,
				upstreamBody,
			);

			if (!response.ok) {
				await credDao.reportFailure(credential.id, response.status, isSub);
				rlog.warn("gateway", "Upstream error, retrying", {
					attempt,
					provider: provider.info.id,
					status: response.status,
				});
				lastError = new Error(
					`Upstream ${provider.info.id} returned ${response.status}`,
				);
				continue;
			}

			const latencyMs = Date.now() - t0;
			const credentialOwnerId = credential.owner_id;
			const isSelfUse = consumerId === credentialOwnerId;

			rlog.info("gateway", "Upstream OK", {
				attempt,
				provider: provider.info.id,
				credentialId: credential.id,
				latencyMs,
			});

			const finalResponse = interceptResponse(response, c.executionCtx, {
				onUsage: (usage) => {
					c.executionCtx.waitUntil(
						(async () => {
							const baseCost = calculateBaseCost(modelPrice, usage);
							const settlement = isPlatform
								? calculateSettlement(baseCost, isSelfUse)
								: {
										consumerCharged: 0,
										providerEarned: 0,
										platformFee: 0,
									};

							await recordUsage(c.env.DB, {
								consumerId,
								credentialId: credential.id,
								credentialOwnerId,
								provider: credential.provider,
								model: modelId,
								baseCost,
								inputTokens: usage.prompt_tokens,
								outputTokens: usage.completion_tokens,
								priceMultiplier: credential.price_multiplier,
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

							rlog.info("billing", "Recorded", {
								provider: credential.provider,
								baseCost,
								inputTokens: usage.prompt_tokens,
								outputTokens: usage.completion_tokens,
							});
						})().catch((err) =>
							rlog.error("billing", "waitUntil failed", {
								error: err instanceof Error ? err.message : String(err),
							}),
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

			return {
				response: finalResponse,
				requestId,
				provider: credential.provider,
				credentialId: credential.id,
			};
		} catch (err) {
			await credDao.reportFailure(credential.id, undefined, isSub);
			rlog.warn("gateway", "Provider threw, retrying", {
				attempt,
				provider: provider.info.id,
				error: err instanceof Error ? err.message : String(err),
			});
			lastError = err;
		}
	}

	rlog.error("gateway", "All candidates exhausted", {
		error: lastError instanceof Error ? lastError.message : String(lastError),
	});
	throw new NoKeyAvailableError(req.model);
}

/**
 * Gateway — Shared completion execution with dispatch, retry, and billing.
 *
 * Both OpenAI (/v1/chat/completions) and Anthropic (/v1/messages) routes
 * delegate here for the core forward-and-bill loop.
 *
 * Lives in routes/ (not core/) because it depends on platform/ billing.
 */

import type { Context } from "hono";
import { calculateBaseCost, recordFailureLog, recordLog } from "../core/billing";
import * as cb from "../core/circuit-breaker";
import { CredentialsDao } from "../core/db/credentials-dao";
import { dispatchAll } from "../core/dispatcher";
import { interceptResponse } from "../core/utils/stream";
import { triggerAutoTopUp } from "../platform/billing/auto-topup-service";
import {
	calculateSettlement,
	settleWallets,
} from "../platform/billing/settlement";
import { WalletDao } from "../platform/billing/wallet-dao";
import {
	CreditsExhaustedNoFallbackError,
	NoKeyAvailableError,
} from "../shared/errors";
import { requestLogger } from "../shared/logger";
import type { AppEnv } from "../shared/types";

export interface CompletionRequest {
	modelId: string;
	body: Record<string, unknown>;
	providerIds?: string[];
}

export interface CompletionResult {
	response: Response;
	requestId: string;
	providerId: string;
	credentialId: string;
}

export async function executeCompletion(
	c: Context<AppEnv>,
	req: CompletionRequest,
): Promise<CompletionResult> {
	const consumerId = c.get("owner_id");
	const isPlatform = !!c.env.CLERK_SECRET_KEY;
	const requestId = crypto.randomUUID();
	const rlog = requestLogger(requestId, { modelId: req.modelId, consumerId });
	const encryptionKey = c.env.ENCRYPTION_KEY;

	let creditsFallback = false;
	if (isPlatform) {
		const balance = await new WalletDao(c.env.DB).getBalance(consumerId);
		if (balance <= 0) creditsFallback = true;
	}

	const poolOwnerId = isPlatform && !creditsFallback ? undefined : consumerId;
	const candidates = await dispatchAll(
		c.env.DB,
		encryptionKey,
		req.modelId,
		poolOwnerId,
		req.providerIds,
	).catch((err) => {
		if (creditsFallback && err instanceof NoKeyAvailableError) {
			throw new CreditsExhaustedNoFallbackError(req.modelId);
		}
		throw err;
	});
	const credDao = new CredentialsDao(c.env.DB, encryptionKey);

	rlog.info("gateway", "Dispatching", { candidates: candidates.length });

	let lastError: unknown;

	for (let attempt = 0; attempt < candidates.length; attempt++) {
		const { credential, provider, modelId, upstreamModelId, modelPrice } =
			candidates[attempt];
		const isSub = provider.info.isSubscription ?? false;

		// Circuit breaker: skip known-bad (provider, model) pairs
		if (cb.isOpen(provider.info.id, modelId)) {
			rlog.info("gateway", "Circuit breaker open, skipping", {
				attempt,
				providerId: provider.info.id,
			});
			continue;
		}

		const upstreamBody = {
			...req.body,
			model: upstreamModelId ?? modelId,
			stream_options: req.body.stream ? { include_usage: true } : undefined,
		};

		try {
			const secret = await credDao.decryptSecret(credential);
			const t0 = Date.now();
			const response = await provider.forwardRequest(secret, upstreamBody);

			if (!response.ok) {
				await credDao.reportFailure(credential.id, response.status, isSub);
				cb.recordFailure(provider.info.id, modelId);

				rlog.warn("gateway", "Upstream error, retrying", {
					attempt,
					providerId: provider.info.id,
					status: response.status,
				});

				// Record failure log asynchronously
				c.executionCtx.waitUntil(
					recordFailureLog(c.env.DB, {
						consumerId,
						credentialId: credential.id,
						credentialOwnerId: credential.owner_id,
						providerId: credential.provider_id,
						modelId,
						priceMultiplier: credential.price_multiplier,
						errorCode: response.status,
					}),
				);

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
				providerId: provider.info.id,
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

							await recordLog(c.env.DB, encryptionKey, {
								consumerId,
								credentialId: credential.id,
								credentialOwnerId,
								providerId: credential.provider_id,
								modelId,
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
								if (c.env.STRIPE_SECRET_KEY) {
									await triggerAutoTopUp(
										c.env.DB,
										c.env.STRIPE_SECRET_KEY,
										consumerId,
									);
								}
							}

							rlog.info("billing", "Recorded", {
								providerId: credential.provider_id,
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
					cb.recordSuccess(provider.info.id, modelId);
					c.executionCtx.waitUntil(credDao.reportSuccess(credential.id));
				},
				onStreamError: (err) => {
					rlog.warn("gateway", "Stream interrupted after 200", {
						providerId: provider.info.id,
						credentialId: credential.id,
						error: err instanceof Error ? err.message : String(err),
					});
					c.executionCtx.waitUntil(
						credDao.reportFailure(credential.id, undefined, isSub),
					);
				},
			});

			return {
				response: finalResponse,
				requestId,
				providerId: credential.provider_id,
				credentialId: credential.id,
			};
		} catch (err) {
			await credDao.reportFailure(credential.id, undefined, isSub);
			cb.recordFailure(provider.info.id, modelId);
			rlog.warn("gateway", "Provider threw, retrying", {
				attempt,
				providerId: provider.info.id,
				error: err instanceof Error ? err.message : String(err),
			});
			lastError = err;
		}
	}

	rlog.error("gateway", "All candidates exhausted", {
		error: lastError instanceof Error ? lastError.message : String(lastError),
	});
	throw new NoKeyAvailableError(req.modelId);
}

/**
 * Gateway — Shared completion execution with dispatch, retry, and billing.
 *
 * Both OpenAI (/v1/chat/completions) and Anthropic (/v1/messages) routes
 * delegate here for the core forward-and-bill loop.
 *
 * Lives in routes/ (not core/) because it depends on platform/ billing.
 */

import type { Context } from "hono";
import {
	calculateBaseCost,
	recordFailureLog,
	recordLog,
} from "../core/billing";
import * as cb from "../core/circuit-breaker";
import { ApiKeysDao } from "../core/db/api-keys-dao";
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
	ModelNotAllowedError,
	NoKeyAvailableError,
} from "../shared/errors";
import { requestLogger } from "../shared/logger";
import type { AppEnv } from "../shared/types";

/**
 * Strip non-standard `cache_control` fields from message content parts.
 * This is an Anthropic-specific extension that causes 400 errors on some
 * upstream providers (e.g. ZenMux → Google) when they attempt conversion.
 */
function sanitizeMessages(
	body: Record<string, unknown>,
): Record<string, unknown> {
	const messages = body.messages;
	if (!Array.isArray(messages)) return body;

	let changed = false;
	const cleaned = messages.map((msg: Record<string, unknown>) => {
		const content = msg.content;
		if (!Array.isArray(content)) return msg;

		const parts = content.map((part: Record<string, unknown>) => {
			if (!part.cache_control) return part;
			changed = true;
			const { cache_control: _, ...rest } = part;
			return rest;
		});

		return { ...msg, content: parts };
	});

	return changed ? { ...body, messages: cleaned } : body;
}

type RequestMode = "chat" | "embedding";

export interface GatewayRequest {
	modelId: string;
	body: Record<string, unknown>;
	providerIds?: string[];
}

export interface GatewayResult {
	response: Response;
	requestId: string;
	providerId: string;
	credentialId: string;
}

export function executeCompletion(
	c: Context<AppEnv>,
	req: GatewayRequest,
): Promise<GatewayResult> {
	return execute(c, req, "chat");
}

export function executeEmbedding(
	c: Context<AppEnv>,
	req: GatewayRequest,
): Promise<GatewayResult> {
	return execute(c, req, "embedding");
}

async function execute(
	c: Context<AppEnv>,
	req: GatewayRequest,
	mode: RequestMode,
): Promise<GatewayResult> {
	const consumerId = c.get("owner_id");
	const apiKeyId = c.get("api_key_id");
	const allowedModels = c.get("allowed_models");
	const isPlatform = !!c.env.CLERK_SECRET_KEY;
	const requestId = crypto.randomUUID();
	const rlog = requestLogger(requestId, { modelId: req.modelId, consumerId });
	const encryptionKey = c.env.ENCRYPTION_KEY;

	if (allowedModels) {
		const id = req.modelId.toLowerCase();
		const matched = allowedModels.some(
			(a) => a === id || (!id.includes("/") && a.endsWith(`/${id}`)),
		);
		if (!matched) throw new ModelNotAllowedError(req.modelId);
	}

	const depth = Number(c.req.header("x-keyaos-depth")) || 0;
	const excludeProviderIds = depth > 0 ? ["keyaos"] : undefined;

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
		excludeProviderIds,
	).catch((err) => {
		if (creditsFallback && err instanceof NoKeyAvailableError) {
			throw new CreditsExhaustedNoFallbackError(req.modelId);
		}
		throw err;
	});
	const credDao = new CredentialsDao(c.env.DB, encryptionKey);

	rlog.info("gateway", "Dispatching", {
		candidates: candidates.length,
		mode,
	});

	let lastError: unknown;

	for (let attempt = 0; attempt < candidates.length; attempt++) {
		const { credential, provider, modelId, upstreamModelId, modelPrice } =
			candidates[attempt];
		const isSub = provider.info.isSubscription ?? false;

		if (mode === "embedding" && !provider.forwardEmbedding) continue;

		if (cb.isOpen(provider.info.id, modelId)) {
			rlog.info("gateway", "Circuit breaker open, skipping", {
				attempt,
				providerId: provider.info.id,
			});
			continue;
		}

		const upstreamModel = upstreamModelId ?? modelId;
		const upstreamBody =
			mode === "chat"
				? {
						...sanitizeMessages(req.body),
						model: upstreamModel,
						stream_options: req.body.stream
							? { include_usage: true }
							: undefined,
					}
				: { ...req.body, model: upstreamModel };

		try {
			const secret = await credDao.decryptSecret(credential);
			const t0 = Date.now();
			const response =
				mode === "chat"
					? await provider.forwardRequest(secret, upstreamBody)
					: await provider.forwardEmbedding?.(secret, upstreamBody);

			if (!response) continue;

			if (!response.ok) {
				await credDao.reportFailure(credential.id, response.status, isSub);
				cb.recordFailure(provider.info.id, modelId);

				const errorBody = await response.text().catch(() => "");
				rlog.warn("gateway", "Upstream error, retrying", {
					attempt,
					providerId: provider.info.id,
					status: response.status,
					detail: errorBody.slice(0, 200),
				});

				c.executionCtx.waitUntil(
					recordFailureLog(c.env.DB, {
						consumerId,
						credentialId: credential.id,
						credentialOwnerId: credential.owner_id,
						providerId: credential.provider_id,
						modelId,
						priceMultiplier: credential.price_multiplier,
						errorCode: response.status,
						errorDetail: errorBody.slice(0, 512) || null,
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

							if (apiKeyId) {
								await new ApiKeysDao(
									c.env.DB,
									encryptionKey,
								).incrementQuotaUsed(apiKeyId, baseCost);
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

			const errMsg = err instanceof Error ? err.message : String(err);
			rlog.warn("gateway", "Provider threw, retrying", {
				attempt,
				providerId: provider.info.id,
				error: errMsg,
			});

			c.executionCtx.waitUntil(
				recordFailureLog(c.env.DB, {
					consumerId,
					credentialId: credential.id,
					credentialOwnerId: credential.owner_id,
					providerId: credential.provider_id,
					modelId,
					priceMultiplier: credential.price_multiplier,
					errorCode: 0,
					errorDetail: errMsg.slice(0, 512) || null,
				}),
			);

			lastError = err;
		}
	}

	rlog.error("gateway", "All candidates exhausted", {
		error: lastError instanceof Error ? lastError.message : String(lastError),
	});
	throw new NoKeyAvailableError(req.modelId);
}

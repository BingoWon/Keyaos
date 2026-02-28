/**
 * Model & Credential Sync Service
 *
 * Two-phase OpenRouter-first sync:
 * Phase 1 — Sync OpenRouter (canonical catalog, sets sort_order).
 * Phase 2 — Sync remaining providers in parallel, filtered to OpenRouter allowlist.
 */

import { log } from "../../shared/logger";
import { CredentialsDao } from "../db/credentials-dao";
import { PricingDao } from "../db/pricing-dao";
import { getAllProviders, getProvider } from "../providers/registry";

export async function syncAllModels(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new PricingDao(db);
	const allProviders = getAllProviders();

	// ─── Phase 1: Sync OpenRouter first (canonical model catalog) ───
	const orProvider = allProviders.find((p) => p.info.id === "openrouter");
	if (!orProvider) {
		log.error("sync", "OpenRouter provider not found in registry");
		return;
	}

	const orModels = await orProvider.fetchModels(cnyUsdRate);
	if (orModels.length === 0) {
		log.warn("sync", "OpenRouter returned 0 models, aborting entire sync");
		return;
	}

	await dao.upsertPricing(orModels);
	await dao.deactivateMissing(
		"openrouter",
		orModels.map((m) => m.id),
	);
	log.info("sync", "OpenRouter synced (canonical)", { count: orModels.length });

	// Build the canonical model_id allowlist
	const allowedModelIds = new Set(orModels.map((m) => m.model_id));

	// ─── Phase 2: Sync all other providers, filtering to allowlist ──
	const otherProviders = allProviders.filter((p) => p.info.id !== "openrouter");
	const results = await Promise.allSettled(
		otherProviders.map(async (provider) => {
			const models = await provider.fetchModels(cnyUsdRate);
			if (models.length === 0) {
				log.warn("sync", "0 models, skipping", { provider: provider.info.id });
				return;
			}

			// Only keep models that OpenRouter also provides
			const filtered = models.filter((m) => allowedModelIds.has(m.model_id));

			if (filtered.length > 0) {
				await dao.upsertPricing(filtered);
			}
			await dao.deactivateMissing(
				provider.info.id,
				filtered.map((m) => m.id),
			);
			log.info("sync", "Models synced", {
				provider: provider.info.id,
				total: models.length,
				kept: filtered.length,
				filtered: models.length - filtered.length,
			});
		}),
	);

	for (const r of results) {
		if (r.status === "rejected") {
			log.error("sync", "Provider failed", {
				error: r.reason instanceof Error ? r.reason.message : String(r.reason),
			});
		}
	}
}

export async function syncAutoCredits(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new CredentialsDao(db);
	const autos = (await dao.getGlobal()).filter(
		(c) => c.quota_source === "auto",
	);

	const results = await Promise.allSettled(
		autos.map(async (credential) => {
			const provider = getProvider(credential.provider);
			if (!provider) return;

			const credits = await provider.fetchCredits(credential.secret);
			if (credits?.remaining == null) return;

			const usd =
				provider.info.currency === "CNY"
					? credits.remaining / cnyUsdRate
					: credits.remaining;

			await dao.updateQuota(credential.id, usd, "auto");
		}),
	);

	for (const r of results) {
		if (r.status === "rejected") {
			log.error("sync", "Credential sync failed", {
				error: r.reason instanceof Error ? r.reason.message : String(r.reason),
			});
		}
	}
}

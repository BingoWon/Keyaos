/**
 * Model & Credential Sync Service
 *
 * Three-phase OpenRouter-first sync:
 * Phase 1 — Sync OpenRouter chat models (canonical catalog, authoritative `created`).
 * Phase 2 — Sync OpenRouter embedding models (separate endpoint).
 * Phase 3 — Sync remaining providers in parallel, filtered to OpenRouter allowlist.
 *           Inherits canonical `created` so all providers share the model's true creation time.
 */

import { log } from "../../shared/logger";
import { CredentialsDao } from "../db/credentials-dao";
import { PricingDao } from "../db/pricing-dao";
import {
	getAllProviders,
	getProvider,
	parseOpenRouterModels,
} from "../providers/registry";

const OPENROUTER_EMBEDDINGS_URL =
	"https://openrouter.ai/api/v1/embeddings/models";

export async function syncAllModels(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new PricingDao(db);
	const allProviders = getAllProviders();

	// ─── Phase 1: Sync OpenRouter chat models (canonical catalog) ───
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
	log.info("sync", "OpenRouter chat synced", { count: orModels.length });

	// ─── Phase 2: Sync OpenRouter embedding models ──────────────
	let orEmbedModels: typeof orModels = [];
	try {
		const res = await fetch(OPENROUTER_EMBEDDINGS_URL);
		if (res.ok) {
			const raw = (await res.json()) as Record<string, unknown>;
			orEmbedModels = parseOpenRouterModels(raw, "embedding");
			if (orEmbedModels.length > 0) {
				await dao.upsertPricing(orEmbedModels);
			}
			log.info("sync", "OpenRouter embeddings synced", {
				count: orEmbedModels.length,
			});
		}
	} catch (err) {
		log.error("sync", "Embedding sync failed", {
			error: err instanceof Error ? err.message : String(err),
		});
	}

	// Deactivate missing OpenRouter models (chat + embedding combined)
	const allOrIds = [
		...orModels.map((m) => m.id),
		...orEmbedModels.map((m) => m.id),
	];
	await dao.deactivateMissing("openrouter", allOrIds);

	// Build canonical lookup: model_id → OpenRouter pricing/metadata
	const allOrModels = [...orModels, ...orEmbedModels];
	const allowedModelIds = new Set(allOrModels.map((m) => m.model_id));
	const canonicalMap = new Map(allOrModels.map((m) => [m.model_id, m]));

	// ─── Phase 3: Sync other providers, filtering to allowlist ──
	const otherProviders = allProviders.filter(
		(p) => p.info.id !== "openrouter",
	);
	const results = await Promise.allSettled(
		otherProviders.map(async (provider) => {
			const models = await provider.fetchModels(cnyUsdRate);
			if (models.length === 0) {
				log.warn("sync", "0 models, skipping", {
					provider_id: provider.info.id,
				});
				return;
			}

			const filtered = models.filter((m) =>
				allowedModelIds.has(m.model_id),
			);

			for (const m of filtered) {
				const canonical = canonicalMap.get(m.model_id);
				if (!canonical) continue;

				// Inherit the model's true creation time from the canonical catalog
				m.created = canonical.created;

				// Enrich models that lack upstream pricing (price == -1)
				if (m.input_price < 0) {
					m.input_price = canonical.input_price;
					m.output_price = canonical.output_price;
					m.model_type = canonical.model_type;
					m.name ??= canonical.name;
					m.context_length ??= canonical.context_length;
					m.input_modalities ??= canonical.input_modalities;
					m.output_modalities ??= canonical.output_modalities;
				}
			}

			if (filtered.length > 0) {
				await dao.upsertPricing(filtered);
			}
			await dao.deactivateMissing(
				provider.info.id,
				filtered.map((m) => m.id),
			);
			log.info("sync", "Models synced", {
				provider_id: provider.info.id,
				total: models.length,
				kept: filtered.length,
				filtered: models.length - filtered.length,
			});
		}),
	);

	for (const r of results) {
		if (r.status === "rejected") {
			log.error("sync", "Provider failed", {
				error:
					r.reason instanceof Error ? r.reason.message : String(r.reason),
			});
		}
	}
}

export async function syncAutoCredits(
	db: D1Database,
	encryptionKey: string,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new CredentialsDao(db, encryptionKey);
	const autos = (await dao.getGlobal()).filter(
		(c) => c.quota_source === "auto",
	);

	const results = await Promise.allSettled(
		autos.map(async (credential) => {
			const provider = getProvider(credential.provider_id);
			if (!provider) return;

			const secret = await dao.decryptSecret(credential);
			const credits = await provider.fetchCredits(secret);
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

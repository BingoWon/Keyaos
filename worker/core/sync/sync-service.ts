/**
 * Model & Credential Sync Service
 *
 * Parallelizes provider fetches via Promise.allSettled.
 * Models are only deactivated when the API returns a valid, non-empty response.
 */

import { CredentialsDao } from "../db/credentials-dao";
import { PricingDao } from "../db/pricing-dao";
import { getAllProviders, getProvider } from "../providers/registry";

export async function syncAllModels(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new PricingDao(db);
	const credDao = new CredentialsDao(db);

	const allCreds = await credDao.getGlobal();
	const secretByProvider = new Map<string, string>();
	for (const c of allCreds) {
		if (c.is_enabled && !secretByProvider.has(c.provider)) {
			secretByProvider.set(c.provider, c.secret);
		}
	}

	const results = await Promise.allSettled(
		getAllProviders().map(async (provider) => {
			const secret = secretByProvider.get(provider.info.id);
			const models = await provider.fetchModels(cnyUsdRate, secret);
			if (models.length === 0) {
				console.warn(`[SYNC] ${provider.info.id}: 0 models, skipping`);
				return;
			}

			await dao.upsertPricing(models);
			await dao.deactivateMissing(
				provider.info.id,
				models.map((m) => m.id),
			);
			console.log(`[SYNC] ${provider.info.id}: synced ${models.length} models`);
		}),
	);

	for (const r of results) {
		if (r.status === "rejected") {
			console.error("[SYNC] provider failed:", r.reason);
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
			console.error("[SYNC] credential sync failed:", r.reason);
		}
	}
}

/**
 * Model Discovery + Auto Credits Refresh
 *
 * Parallelizes provider fetches via Promise.allSettled for faster refresh cycles.
 */

import { MarketDao } from "../db/market-dao";
import { QuotasDao } from "../db/quotas-dao";
import { getAllProviders, getProvider } from "../providers/registry";

export async function refreshAllModels(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new MarketDao(db);

	const results = await Promise.allSettled(
		getAllProviders().map(async (provider) => {
			const models = await provider.fetchModels(cnyUsdRate);
			if (models.length === 0) {
				console.warn(`[REFRESH] ${provider.info.id}: 0 models, skipping`);
				return;
			}

			await dao.upsertQuotes(models);
			await dao.deactivateMissing(
				provider.info.id,
				models.map((m) => m.id),
			);
			console.log(
				`[REFRESH] ${provider.info.id}: refreshed ${models.length} models`,
			);
		}),
	);

	for (const r of results) {
		if (r.status === "rejected") {
			console.error("[REFRESH] provider failed:", r.reason);
		}
	}
}

export async function refreshAutoCredits(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new QuotasDao(db);
	const autos = (await dao.getGlobalListings()).filter(
		(k) => k.quota_source === "auto",
	);

	const results = await Promise.allSettled(
		autos.map(async (listing) => {
			const provider = getProvider(listing.provider);
			if (!provider) return;

			const credits = await provider.fetchCredits(listing.api_key);
			if (credits?.remaining == null) return;

			const usd =
				provider.info.currency === "CNY"
					? credits.remaining / cnyUsdRate
					: credits.remaining;

			await dao.updateQuota(listing.id, usd, "auto");
		}),
	);

	for (const r of results) {
		if (r.status === "rejected") {
			console.error("[QUOTA] refresh failed:", r.reason);
		}
	}
}

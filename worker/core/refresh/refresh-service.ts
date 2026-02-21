/**
 * Model Discovery Service + Auto Credits Refresh
 *
 * Iterates all registered providers, calls fetchModels(), and
 * upserts into the models table. Also refreshes credits for auto-credit keys.
 * Called by the scheduled handler.
 */
import { ListingsDao } from "../db/listings-dao";
import { MarketDao } from "../db/market-dao";
import { getAllProviders, getProvider } from "../providers/registry";

export async function refreshAllModels(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new MarketDao(db);

	for (const provider of getAllProviders()) {
		try {
			const models = await provider.fetchModels(cnyUsdRate);

			if (models.length === 0) {
				console.warn(`[REFRESH] ${provider.info.id}: 0 models, skipping`);
				continue;
			}

			await dao.upsertQuotes(models);
			await dao.deactivateMissing(
				provider.info.id,
				models.map((m) => m.id),
			);

			console.log(
				`[REFRESH] ${provider.info.id}: refreshed ${models.length} models`,
			);
		} catch (err) {
			console.error(`[REFRESH] ${provider.info.id}: failed`, err);
		}
	}
}

/** Refresh credits for all listings with credits_source='auto' */
export async function refreshAutoCredits(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new ListingsDao(db);
	const all = await dao.getAllListings();
	const autos = all.filter((k) => k.credits_source === "auto");

	for (const listing of autos) {
		try {
			const provider = getProvider(listing.provider);
			if (!provider) continue;

			const credits = await provider.fetchCredits(listing.api_key);
			if (credits?.remaining == null) continue;

			const usd =
				provider.info.currency === "CNY"
					? credits.remaining / cnyUsdRate
					: credits.remaining;
			const newCents = Math.round(usd * 100);

			await dao.updateCredits(listing.id, newCents, "auto");
		} catch (err) {
			console.error(`[CREDITS] ${listing.id}: refresh failed`, err);
		}
	}
}

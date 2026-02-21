/**
 * Model Discovery + Auto Credits Refresh
 *
 * Parallelizes provider fetches via Promise.allSettled for faster refresh cycles.
 */

import { CredentialsDao } from "../db/credentials-dao";
import { PricingDao } from "../db/pricing-dao";
import { getAllProviders, getProvider } from "../providers/registry";

export async function refreshAllModels(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new PricingDao(db);

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
			console.error("[QUOTA] refresh failed:", r.reason);
		}
	}
}

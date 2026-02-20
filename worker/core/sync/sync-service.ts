/**
 * Model Sync Service
 *
 * Iterates all registered providers, calls fetchModels(), and
 * upserts into the models table. No provider-specific code here.
 */
import { ModelsDao } from "../db/models-dao";
import { getAllProviders } from "../providers/registry";

export async function syncAllProviders(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new ModelsDao(db);

	for (const provider of getAllProviders()) {
		try {
			const models = await provider.fetchModels(cnyUsdRate);

			if (models.length === 0) {
				console.warn(`[SYNC] ${provider.info.id}: 0 models, skipping`);
				continue;
			}

			await dao.upsertModels(models);
			await dao.deactivateMissing(
				provider.info.id,
				models.map((m) => m.id),
			);

			console.log(`[SYNC] ${provider.info.id}: synced ${models.length} models`);
		} catch (err) {
			console.error(`[SYNC] ${provider.info.id}: failed`, err);
		}
	}
}

/**
 * Model Sync Service
 *
 * Fetches model lists from all providers, parses pricing,
 * and upserts into the models table. Called by the scheduled handler.
 */
import { ModelsDao } from "../db/models-dao";
import { getProviderIds } from "../providers/registry";
import {
	parseDeepInfra,
	parseDeepSeek,
	parseOpenRouter,
	parseZenMux,
} from "./parsers";

const PROVIDER_ENDPOINTS: Record<string, string> = {
	openrouter: "https://openrouter.ai/api/v1/models",
	zenmux: "https://zenmux.ai/api/v1/models",
	deepinfra: "https://api.deepinfra.com/v1/openai/models",
	deepseek: "https://api.deepseek.com/models",
};

const PARSERS: Record<
	string,
	(
		raw: { data?: unknown[] },
		rate?: number,
	) => ReturnType<typeof parseOpenRouter>
> = {
	openrouter: parseOpenRouter,
	zenmux: parseZenMux,
	deepinfra: parseDeepInfra,
	deepseek: parseDeepSeek,
};

export async function syncAllProviders(
	db: D1Database,
	cnyUsdRate = 7,
): Promise<void> {
	const dao = new ModelsDao(db);

	for (const providerId of getProviderIds()) {
		const endpoint = PROVIDER_ENDPOINTS[providerId];
		const parser = PARSERS[providerId];
		if (!endpoint || !parser) continue;

		try {
			const res = await fetch(endpoint);
			if (!res.ok) {
				console.error(`[SYNC] ${providerId}: HTTP ${res.status}`);
				continue;
			}

			const raw = (await res.json()) as { data?: unknown[] };
			const models = parser(raw, cnyUsdRate);

			if (models.length === 0) {
				console.warn(`[SYNC] ${providerId}: parsed 0 models, skipping`);
				continue;
			}

			await dao.upsertModels(models);
			await dao.deactivateMissing(
				providerId,
				models.map((m) => m.id),
			);

			console.log(`[SYNC] ${providerId}: synced ${models.length} models`);
		} catch (err) {
			console.error(`[SYNC] ${providerId}: failed`, err);
		}
	}
}

/**
 * Dispatcher — Global optimal key selection and request routing
 *
 * Queries the models table to find which providers serve a model,
 * then selects the cheapest provider+key combination by:
 *   cost = model.input_cost × key.price_ratio
 */

import { BadRequestError, NoKeyAvailableError } from "../shared/errors";
import { ModelsDao } from "./db/models-dao";
import type { DbKeyPool } from "./db/schema";
import { KeyPoolService } from "./key-pool";
import type { ProviderAdapter } from "./providers/interface";
import { getProvider } from "./providers/registry";

export interface DispatchResult {
	key: DbKeyPool;
	provider: ProviderAdapter;
	upstreamModel: string;
	/** Model cost info from the models table (for billing) */
	modelCost: { inputCentsPerM: number; outputCentsPerM: number };
}

export async function dispatch(
	db: D1Database,
	model: string,
): Promise<DispatchResult> {
	if (!model) throw new BadRequestError("Model is required");

	const modelsDao = new ModelsDao(db);
	const keyPool = new KeyPoolService(db);

	// Find all providers that serve this model, sorted by input_cost ASC
	const offerings = await modelsDao.findByUpstreamId(model);

	for (const offering of offerings) {
		const provider = getProvider(offering.provider);
		if (!provider) continue;

		const key = await keyPool.selectKey(offering.provider);
		if (!key) continue;

		return {
			key,
			provider,
			upstreamModel: offering.upstream_id,
			modelCost: {
				inputCentsPerM: offering.input_cost,
				outputCentsPerM: offering.output_cost,
			},
		};
	}

	throw new NoKeyAvailableError(model);
}

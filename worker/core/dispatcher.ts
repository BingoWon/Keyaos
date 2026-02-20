/**
 * Dispatcher — Global optimal key selection with automatic retry
 */

import { BadRequestError, NoKeyAvailableError } from "../shared/errors";
import { KeysDao } from "./db/keys-dao";
import { ModelsDao } from "./db/models-dao";
import type { DbKeyPool } from "./db/schema";
import type { ProviderAdapter } from "./providers/interface";
import { getProvider } from "./providers/registry";

export interface DispatchResult {
	key: DbKeyPool;
	provider: ProviderAdapter;
	upstreamModel: string;
	modelCost: { inputCentsPerM: number; outputCentsPerM: number };
}

export async function dispatch(
	db: D1Database,
	model: string,
): Promise<DispatchResult> {
	if (!model) throw new BadRequestError("Model is required");

	const modelsDao = new ModelsDao(db);
	const keysDao = new KeysDao(db);

	const offerings = await modelsDao.findByUpstreamId(model);

	for (const offering of offerings) {
		const provider = getProvider(offering.provider);
		if (!provider) continue;

		const key = await keysDao.selectKey(offering.provider);
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

/**
 * Dispatcher — Global optimal key selection with multi-candidate support
 *
 * Returns ALL viable candidates sorted by effective cost (cheapest first),
 * enabling the caller to implement retry across providers and keys.
 */

import { BadRequestError, NoKeyAvailableError } from "../shared/errors";
import { PricingDao } from "./db/pricing-dao";
import type { DbUpstreamKey } from "./db/schema";
import { UpstreamKeysDao } from "./db/upstream-keys-dao";
import type { ProviderAdapter } from "./providers/interface";
import { getProvider } from "./providers/registry";

export interface DispatchResult {
	upstreamKey: DbUpstreamKey;
	provider: ProviderAdapter;
	upstreamModel: string;
	modelPrice: { inputPricePerM: number; outputPricePerM: number };
}

/**
 * Returns all viable provider+key candidates for a model, sorted by effective cost.
 * Offerings are sorted by input_price ASC from DB; within each offering,
 * upstream keys are sorted by price_multiplier ASC then quota DESC.
 * Final candidates are globally sorted by true effective cost.
 */
export async function dispatchAll(
	db: D1Database,
	model: string,
	owner_id: string,
): Promise<DispatchResult[]> {
	if (!model) throw new BadRequestError("Model is required");

	const pricingDao = new PricingDao(db);
	const keysDao = new UpstreamKeysDao(db);

	const offerings = await pricingDao.findByUpstreamId(model);
	const candidates: DispatchResult[] = [];

	for (const offering of offerings) {
		const provider = getProvider(offering.provider);
		if (!provider) continue;

		const upstreamKeys = await keysDao.selectAvailable(
			offering.provider,
			owner_id,
		);

		for (const upstreamKey of upstreamKeys) {
			candidates.push({
				upstreamKey,
				provider,
				upstreamModel: offering.upstream_id,
				modelPrice: {
					inputPricePerM: offering.input_price * upstreamKey.price_multiplier,
					outputPricePerM: offering.output_price * upstreamKey.price_multiplier,
				},
			});
		}
	}

	if (candidates.length === 0) throw new NoKeyAvailableError(model);

	candidates.sort(
		(a, b) => a.modelPrice.inputPricePerM - b.modelPrice.inputPricePerM,
	);
	return candidates;
}

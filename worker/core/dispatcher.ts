/**
 * Dispatcher — Global optimal key selection with automatic retry
 */

import { BadRequestError, NoKeyAvailableError } from "../shared/errors";
import { ListingsDao } from "./db/listings-dao";
import { MarketDao } from "./db/market-dao";
import type { DbCreditListing } from "./db/schema";
import type { ProviderAdapter } from "./providers/interface";
import { getProvider } from "./providers/registry";

export interface DispatchResult {
	listing: DbCreditListing;
	provider: ProviderAdapter;
	upstreamModel: string;
	modelCost: { inputCentsPerM: number; outputCentsPerM: number };
}

export async function dispatch(
	db: D1Database,
	model: string,
): Promise<DispatchResult> {
	if (!model) throw new BadRequestError("Model is required");

	const marketDao = new MarketDao(db);
	const listingsDao = new ListingsDao(db);

	const offerings = await marketDao.findByUpstreamId(model);

	for (const offering of offerings) {
		const provider = getProvider(offering.provider);
		if (!provider) continue;

		const listing = await listingsDao.selectListing(offering.provider);
		if (!listing) continue;

		return {
			listing,
			provider,
			upstreamModel: offering.upstream_id,
			modelCost: {
				inputCentsPerM: offering.input_cost * listing.price_multiplier,
				outputCentsPerM: offering.output_cost * listing.price_multiplier,
			},
		};
	}

	throw new NoKeyAvailableError(model);
}

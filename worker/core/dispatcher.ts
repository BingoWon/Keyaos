/**
 * Dispatcher — Global optimal key selection with automatic retry
 */

import { BadRequestError, NoKeyAvailableError } from "../shared/errors";
import { QuotasDao } from "./db/quotas-dao";
import { MarketDao } from "./db/market-dao";
import type { DbQuotaListing } from "./db/schema";
import type { ProviderAdapter } from "./providers/interface";
import { getProvider } from "./providers/registry";

export interface DispatchResult {
	listing: DbQuotaListing;
	provider: ProviderAdapter;
	upstreamModel: string;
	modelPrice: { inputPricePerM: number; outputPricePerM: number };
}

export async function dispatch(
	db: D1Database,
	model: string,
): Promise<DispatchResult> {
	if (!model) throw new BadRequestError("Model is required");

	const marketDao = new MarketDao(db);
	const quotasDao = new QuotasDao(db);

	const offerings = await marketDao.findByUpstreamId(model);

	for (const offering of offerings) {
		const provider = getProvider(offering.provider);
		if (!provider) continue;

		const listing = await quotasDao.selectListing(offering.provider);
		if (!listing) continue;

		return {
			listing,
			provider,
			upstreamModel: offering.upstream_id,
			modelPrice: {
				inputPricePerM: offering.input_price * listing.price_multiplier,
				outputPricePerM: offering.output_price * listing.price_multiplier,
			},
		};
	}

	throw new NoKeyAvailableError(model);
}

/**
 * Dispatcher — Global optimal credential selection with multi-candidate support
 *
 * Returns ALL viable candidates sorted by effective cost (cheapest first),
 * enabling the caller to implement retry across providers and credentials.
 */

import { BadRequestError, NoKeyAvailableError } from "../shared/errors";
import { CredentialsDao } from "./db/credentials-dao";
import { PricingDao } from "./db/pricing-dao";
import type { DbCredential } from "./db/schema";
import type { ProviderAdapter } from "./providers/interface";
import { getProvider } from "./providers/registry";

export interface DispatchResult {
	credential: DbCredential;
	provider: ProviderAdapter;
	modelId: string;
	modelPrice: { inputPricePerM: number; outputPricePerM: number };
}

/**
 * Returns all viable provider+credential candidates for a model, sorted by effective cost.
 * Offerings are sorted by input_price ASC from DB; within each offering,
 * credentials are sorted by price_multiplier ASC then quota DESC (NULL = unlimited).
 * Final candidates are globally sorted by true effective cost.
 */
export async function dispatchAll(
	db: D1Database,
	model: string,
	owner_id: string,
): Promise<DispatchResult[]> {
	if (!model) throw new BadRequestError("Model is required");

	const pricingDao = new PricingDao(db);
	const credDao = new CredentialsDao(db);

	const offerings = await pricingDao.findByModelId(model);
	const candidates: DispatchResult[] = [];

	for (const offering of offerings) {
		const provider = getProvider(offering.provider);
		if (!provider) continue;

		const credentials = await credDao.selectAvailable(
			offering.provider,
			owner_id,
		);

		for (const credential of credentials) {
			candidates.push({
				credential,
				provider,
				modelId: offering.model_id,
				modelPrice: {
					inputPricePerM: offering.input_price * credential.price_multiplier,
					outputPricePerM: offering.output_price * credential.price_multiplier,
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

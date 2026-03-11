/**
 * Dispatcher — Global optimal credential selection with multi-candidate support
 *
 * Returns ALL viable candidates sorted by effective cost (cheapest first),
 * enabling the caller to implement retry across providers and credentials.
 */

import { BadRequestError, NoKeyAvailableError } from "../shared/errors";
import { CatalogDao } from "./db/catalog-dao";
import { CredentialsDao } from "./db/credentials-dao";
import type { DbCredential } from "./db/schema";
import type { ProviderAdapter } from "./providers/interface";
import { getProvider } from "./providers/registry";

export interface DispatchResult {
	credential: DbCredential;
	provider: ProviderAdapter;
	modelId: string;
	upstreamModelId: string | null;
	modelPrice: { inputPricePerM: number; outputPricePerM: number };
}

/**
 * Returns all viable provider+credential candidates for a model, sorted by effective cost.
 * Offerings are sorted by input_price ASC from DB; within each offering,
 * credentials are sorted by price_multiplier ASC then quota DESC (NULL = unlimited).
 * Final candidates are globally sorted by true effective cost.
 *
 * When ownerId is omitted (platform mode), credentials are pooled from ALL users.
 */
export async function dispatchAll(
	db: D1Database,
	encryptionKey: string,
	modelId: string,
	ownerId?: string,
	providerIds?: string[],
	excludeProviderIds?: string[],
): Promise<DispatchResult[]> {
	if (!modelId) throw new BadRequestError("Model is required");

	const catalogDao = new CatalogDao(db);
	const credDao = new CredentialsDao(db, encryptionKey);

	const offerings = await catalogDao.findByModelId(modelId);
	const candidates: DispatchResult[] = [];

	for (const offering of offerings) {
		if (providerIds?.length && !providerIds.includes(offering.provider_id))
			continue;
		if (excludeProviderIds?.includes(offering.provider_id)) continue;
		if (offering.input_price < 0 || offering.output_price < 0) continue;
		const provider = getProvider(offering.provider_id);
		if (!provider) continue;

		const credentials = await credDao.selectAvailable(
			offering.provider_id,
			ownerId,
		);

		for (const credential of credentials) {
			candidates.push({
				credential,
				provider,
				modelId: offering.model_id,
				upstreamModelId: offering.upstream_model_id,
				modelPrice: {
					inputPricePerM: offering.input_price * credential.price_multiplier,
					outputPricePerM: offering.output_price * credential.price_multiplier,
				},
			});
		}
	}

	if (candidates.length === 0) throw new NoKeyAvailableError(modelId);

	candidates.sort((a, b) => {
		const diff = a.modelPrice.inputPricePerM - b.modelPrice.inputPricePerM;
		return diff !== 0 ? diff : Math.random() - 0.5;
	});
	return candidates;
}

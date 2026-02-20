/**
 * Dispatcher — Global optimal key selection with automatic retry
 *
 * Queries the models table for all providers serving a model,
 * sorted by cost ASC. Tries each provider+key combination until
 * one succeeds or all are exhausted.
 */

import { BadRequestError, NoKeyAvailableError } from "../shared/errors";
import { KeysDao } from "./db/keys-dao";
import { ModelsDao } from "./db/models-dao";
import type { DbKeyPool } from "./db/schema";
import type { ProviderAdapter } from "./providers/interface";
import { getProvider } from "./providers/registry";
import { decrypt } from "./utils/crypto";

export interface DispatchResult {
	key: DbKeyPool;
	provider: ProviderAdapter;
	upstreamModel: string;
	modelCost: { inputCentsPerM: number; outputCentsPerM: number };
	/** Decrypted API key for upstream request */
	decryptedApiKey: string;
}

export async function dispatch(
	db: D1Database,
	encryptionKey: string,
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

		try {
			const decryptedApiKey = await decrypt(
				key.api_key_encrypted,
				encryptionKey,
			);

			return {
				key,
				provider,
				upstreamModel: offering.upstream_id,
				modelCost: {
					inputCentsPerM: offering.input_cost,
					outputCentsPerM: offering.output_cost,
				},
				decryptedApiKey,
			};
		} catch {
			// Decryption failed — key is corrupted, mark dead
			await keysDao.reportFailure(key.id, 401);
		}
	}

	throw new NoKeyAvailableError(model);
}

/**
 * Key pool management
 *
 * Wraps the KeysDao to provide business logic for key selection,
 * failure reporting, and statistics.
 */

import { KeysDao } from "./db/keys-dao";
import type { DbKeyPool } from "./db/schema";

export class KeyPoolService {
	private dao: KeysDao;

	constructor(db: D1Database) {
		this.dao = new KeysDao(db);
	}

	async addKey(
		ownerId: string,
		provider: string,
		apiKey: string,
		supportedModels: string[] = [],
	): Promise<DbKeyPool> {
		return this.dao.addKey(ownerId, provider, apiKey, supportedModels);
	}

	async removeKey(id: string, ownerId?: string): Promise<boolean> {
		return this.dao.deleteKey(id, ownerId);
	}

	async getAvailableKeys(provider: string, model?: string): Promise<DbKeyPool[]> {
		const keys = await this.dao.getAvailableKeys(provider);

		if (!model) return keys;

		// Filter by model client-side since SQLite JSON filtering can be complex
		return keys.filter(k => {
			try {
				const models = JSON.parse(k.supported_models) as string[];
				return models.length === 0 || models.includes(model);
			} catch {
				return false;
			}
		});
	}

	/**
	 * Select the best key for a request.
	 * Returns the first available key. The DAO already orders by price and health.
	 */
	async selectKey(provider: string, model?: string): Promise<DbKeyPool | null> {
		const available = await this.getAvailableKeys(provider, model);
		if (available.length === 0) return null;

		// The DAO sorts by price_ratio ASC, last_health_check ASC
		// We just pick the top one.
		return available[0];
	}

	async reportSuccess(id: string): Promise<void> {
		await this.dao.reportSuccess(id);
	}

	async reportFailure(id: string, statusCode?: number): Promise<void> {
		const key = await this.dao.getKey(id);
		if (!key) return;

		// Parse current failure count (we don't persist this field in DB currently for simplicity, 
		// but in a real app, we might want to track consecutive failures.
		// For MVP, we'll just check status codes and immediately degrade/kill).

		if (statusCode === 401 || statusCode === 403 || statusCode === 402) {
			// Instant kill for auth/billing errors
			await this.dao.updateHealth(id, "dead", 0);
		} else {
			// Degrade for network errors. A cron job would check degraded keys and revive or kill them.
			await this.dao.updateHealth(id, "degraded", 0);
		}
	}

	async getAllKeys(): Promise<DbKeyPool[]> {
		return this.dao.getAllKeys();
	}

	async getStats(): Promise<{
		totalKeys: number;
		activeProviders: number;
		deadKeys: number;
	}> {
		const all = await this.getAllKeys();
		const providerSet = new Set<string>();
		let deadKeys = 0;

		for (const k of all) {
			if (k.health_status === "dead") {
				deadKeys++;
			} else if (k.is_active === 1) {
				providerSet.add(k.provider);
			}
		}

		return {
			totalKeys: all.length,
			activeProviders: providerSet.size,
			deadKeys
		};
	}
}

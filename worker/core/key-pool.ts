/**
 * Key pool management
 *
 * Business logic layer over KeysDao for key selection,
 * health reporting, and statistics.
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
	): Promise<DbKeyPool> {
		return this.dao.addKey(ownerId, provider, apiKey);
	}

	async removeKey(id: string, ownerId?: string): Promise<boolean> {
		return this.dao.deleteKey(id, ownerId);
	}

	/**
	 * Select the best key for a request.
	 * The DAO already orders by price_ratio ASC.
	 */
	async selectKey(provider: string): Promise<DbKeyPool | null> {
		const available = await this.dao.getAvailableKeys(provider);
		return available[0] || null;
	}

	async reportSuccess(id: string): Promise<void> {
		await this.dao.reportSuccess(id);
	}

	async reportFailure(id: string, statusCode?: number): Promise<void> {
		if (statusCode === 401 || statusCode === 403 || statusCode === 402) {
			await this.dao.updateHealth(id, "dead");
		} else {
			await this.dao.updateHealth(id, "degraded");
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
			deadKeys,
		};
	}
}

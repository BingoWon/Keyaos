/**
 * Keys Data Access Object
 *
 * Handles all key_pool operations including CRUD, selection,
 * health tracking, and statistics.
 */
import type { DbKeyPool } from "./schema";

export class KeysDao {
	constructor(private db: D1Database) {}

	async addKey(
		ownerId: string,
		provider: string,
		encryptedKey: string,
		priceRatio = 0.5,
	): Promise<DbKeyPool> {
		const id = `key_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO key_pool (
					id, owner_id, provider, api_key_encrypted,
					price_ratio, is_active, health_status, created_at
				) VALUES (?, ?, ?, ?, ?, 1, 'ok', ?)`,
			)
			.bind(id, ownerId, provider, encryptedKey, priceRatio, Date.now())
			.run();

		const key = await this.getKey(id);
		if (!key) throw new Error("Failed to retrieve newly created key");
		return key;
	}

	async getKey(id: string): Promise<DbKeyPool | null> {
		return this.db
			.prepare("SELECT * FROM key_pool WHERE id = ?")
			.bind(id)
			.first<DbKeyPool>();
	}

	async deleteKey(id: string, ownerId?: string): Promise<boolean> {
		let query = "DELETE FROM key_pool WHERE id = ?";
		const bindings: string[] = [id];

		if (ownerId) {
			query += " AND owner_id = ?";
			bindings.push(ownerId);
		}

		const result = await this.db
			.prepare(query)
			.bind(...bindings)
			.run();
		return result.success && result.meta?.rows_written === 1;
	}

	/** Select the cheapest available key for a provider */
	async selectKey(provider: string): Promise<DbKeyPool | null> {
		return this.db
			.prepare(
				`SELECT * FROM key_pool
				 WHERE provider = ? AND is_active = 1 AND health_status != 'dead'
				 ORDER BY price_ratio ASC
				 LIMIT 1`,
			)
			.bind(provider)
			.first<DbKeyPool>();
	}

	async getAllKeys(): Promise<DbKeyPool[]> {
		const res = await this.db
			.prepare("SELECT * FROM key_pool")
			.all<DbKeyPool>();
		return res.results || [];
	}

	async reportSuccess(id: string): Promise<void> {
		await this.db
			.prepare(
				"UPDATE key_pool SET health_status = 'ok', last_health_check = ? WHERE id = ?",
			)
			.bind(Date.now(), id)
			.run();
	}

	async reportFailure(id: string, statusCode?: number): Promise<void> {
		const status =
			statusCode === 401 || statusCode === 402 || statusCode === 403
				? "dead"
				: "degraded";

		await this.db
			.prepare(
				`UPDATE key_pool
				 SET health_status = ?,
				     last_health_check = ?,
				     is_active = CASE WHEN ? = 'dead' THEN 0 ELSE is_active END
				 WHERE id = ?`,
			)
			.bind(status, Date.now(), status, id)
			.run();
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

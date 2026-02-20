/**
 * Keys Data Access Object
 */
import type { DbKeyPool } from "./schema";

export class KeysDao {
	constructor(private db: D1Database) {}

	async addKey(
		ownerId: string,
		provider: string,
		encryptedKey: string,
		supportedModels: string[],
		priceRatio: number = 0.5,
	): Promise<DbKeyPool> {
		const now = Date.now();
		const id = `key_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO key_pool (
          id, owner_id, provider, api_key_encrypted, 
          supported_models, price_ratio, is_active, 
          health_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 'ok', ?)`,
			)
			.bind(
				id,
				ownerId,
				provider,
				encryptedKey,
				JSON.stringify(supportedModels),
				priceRatio,
				now,
			)
			.run();

		return (await this.getKey(id))!;
	}

	async getKey(id: string): Promise<DbKeyPool | null> {
		return await this.db
			.prepare("SELECT * FROM key_pool WHERE id = ?")
			.bind(id)
			.first<DbKeyPool>();
	}

	/**
	 * Deletes a key permanently.
	 * In a real-world scenario, you might want to soft-delete (is_active = 0)
	 * if transaction history references this key. Let's do a hard delete for MVP.
	 */
	async deleteKey(id: string, ownerId?: string): Promise<boolean> {
		let query = "DELETE FROM key_pool WHERE id = ?";
		const bindings = [id];

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

	/**
	 * Fast query to find all healthy, active keys for a specific provider
	 * Assumes JSON extract capability exists in D1 SQLite if we need exact model match later,
	 * but for MVP we fetch all active keys for the provider and let TS filter the JSON model array if needed.
	 */
	async getAvailableKeys(provider: string): Promise<DbKeyPool[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM key_pool WHERE provider = ? AND is_active = 1 AND health_status != 'dead' ORDER BY price_ratio ASC, last_health_check ASC LIMIT 100",
			)
			.bind(provider)
			.all<DbKeyPool>();

		return res.results || [];
	}

	/**
	 * Returns all keys (often used for Dashboard stats)
	 */
	async getAllKeys(): Promise<DbKeyPool[]> {
		const res = await this.db
			.prepare("SELECT * FROM key_pool")
			.all<DbKeyPool>();
		return res.results || [];
	}

	async updateHealth(
		id: string,
		status: "ok" | "degraded" | "dead",
		failureCount: number,
	): Promise<void> {
		await this.db
			.prepare(
				"UPDATE key_pool SET health_status = ?, last_health_check = ?, is_active = CASE WHEN ? = 'dead' THEN 0 ELSE is_active END WHERE id = ?",
			)
			.bind(status, Date.now(), status, id)
			.run();
	}

	async reportSuccess(id: string): Promise<void> {
		await this.db
			.prepare(
				"UPDATE key_pool SET health_status = 'ok', last_health_check = ? WHERE id = ?",
			)
			.bind(Date.now(), id)
			.run();
	}
}

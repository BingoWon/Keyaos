import type { DbKeyPool } from "./schema";

export class KeysDao {
	constructor(private db: D1Database) {}

	async addKey(params: {
		ownerId: string;
		provider: string;
		apiKey: string;
		creditsCents?: number;
		creditsSource?: "auto" | "manual";
	}): Promise<DbKeyPool> {
		const id = `key_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO key_pool (
					id, owner_id, provider, api_key,
					credits_cents, credits_source,
					is_active, health_status, added_at
				) VALUES (?, ?, ?, ?, ?, ?, 1, 'ok', ?)`,
			)
			.bind(
				id,
				params.ownerId,
				params.provider,
				params.apiKey,
				params.creditsCents ?? 0,
				params.creditsSource ?? "manual",
				Date.now(),
			)
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

	async findByApiKey(apiKey: string): Promise<DbKeyPool | null> {
		return this.db
			.prepare("SELECT * FROM key_pool WHERE api_key = ?")
			.bind(apiKey)
			.first<DbKeyPool>();
	}

	async deleteKey(id: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM key_pool WHERE id = ?")
			.bind(id)
			.run();
		return result.success && result.meta?.rows_written === 1;
	}

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

	async deductCredits(id: string, cents: number): Promise<void> {
		await this.db
			.prepare(
				`UPDATE key_pool
				 SET credits_cents = MAX(credits_cents - ?, 0),
				     is_active = CASE WHEN credits_cents - ? <= 0 THEN 0 ELSE is_active END
				 WHERE id = ?`,
			)
			.bind(cents, cents, id)
			.run();
	}

	async updateCredits(
		id: string,
		creditsCents: number,
		source?: "auto" | "manual",
	): Promise<void> {
		if (source) {
			await this.db
				.prepare(
					"UPDATE key_pool SET credits_cents = ?, credits_source = ? WHERE id = ?",
				)
				.bind(creditsCents, source, id)
				.run();
		} else {
			await this.db
				.prepare("UPDATE key_pool SET credits_cents = ? WHERE id = ?")
				.bind(creditsCents, id)
				.run();
		}
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
			if (k.health_status === "dead") deadKeys++;
			else if (k.is_active === 1) providerSet.add(k.provider);
		}
		return {
			totalKeys: all.length,
			activeProviders: providerSet.size,
			deadKeys,
		};
	}
}

import type { DbLogEntry } from "./schema";

export class LogsDao {
	constructor(private db: D1Database) {}

	async createEntry(
		tx: Omit<DbLogEntry, "id" | "created_at">,
	): Promise<string> {
		const id = `tx_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO logs (
					id, consumer_id, credential_id, credential_owner_id, provider, model,
					input_tokens, output_tokens, base_cost,
					consumer_charged, provider_earned, platform_fee, price_multiplier, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				tx.consumer_id,
				tx.credential_id,
				tx.credential_owner_id,
				tx.provider,
				tx.model,
				tx.input_tokens,
				tx.output_tokens,
				tx.base_cost,
				tx.consumer_charged,
				tx.provider_earned,
				tx.platform_fee,
				tx.price_multiplier,
				Date.now(),
			)
			.run();

		return id;
	}

	async getEntriesForUser(userId: string, limit = 50): Promise<DbLogEntry[]> {
		const res = await this.db
			.prepare(
				`SELECT * FROM logs
				 WHERE consumer_id = ? OR credential_owner_id = ?
				 ORDER BY created_at DESC LIMIT ?`,
			)
			.bind(userId, userId, limit)
			.all<DbLogEntry>();

		return res.results || [];
	}

	async getEarnings24h(userId: string): Promise<number> {
		const since = Date.now() - 24 * 60 * 60 * 1000;
		const res = await this.db
			.prepare(
				`SELECT COALESCE(SUM(provider_earned), 0) AS total
				 FROM logs
				 WHERE credential_owner_id = ? AND consumer_id != ? AND created_at >= ?`,
			)
			.bind(userId, userId, since)
			.first<{ total: number }>();
		return res?.total ?? 0;
	}

	/** Sum provider_earned per credential for a given credential owner */
	async getEarningsByCredential(
		credentialOwnerId: string,
	): Promise<Map<string, number>> {
		const res = await this.db
			.prepare(
				`SELECT credential_id, SUM(provider_earned) as total
				 FROM logs WHERE credential_owner_id = ?
				 GROUP BY credential_id`,
			)
			.bind(credentialOwnerId)
			.all<{ credential_id: string; total: number }>();

		const map = new Map<string, number>();
		for (const row of res.results || []) {
			map.set(row.credential_id, row.total);
		}
		return map;
	}
}

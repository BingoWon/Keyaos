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
					id, consumer_id, credential_id, credential_owner_id, provider_id, model_id,
					input_tokens, output_tokens, base_cost,
					consumer_charged, provider_earned, platform_fee, price_multiplier,
					status, error_code, error_detail, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				tx.consumer_id,
				tx.credential_id,
				tx.credential_owner_id,
				tx.provider_id,
				tx.model_id,
				tx.input_tokens,
				tx.output_tokens,
				tx.base_cost,
				tx.consumer_charged,
				tx.provider_earned,
				tx.platform_fee,
				tx.price_multiplier,
				tx.status,
				tx.error_code,
				tx.error_detail,
				Date.now(),
			)
			.run();

		return id;
	}

	async getEntriesForUser(
		userId: string,
		limit: number,
		offset = 0,
	): Promise<DbLogEntry[]> {
		const res = await this.db
			.prepare(
				`SELECT * FROM logs
				 WHERE (consumer_id = ?1 OR credential_owner_id = ?1)
				   AND status = 'ok'
				 ORDER BY created_at DESC
				 LIMIT ?2 OFFSET ?3`,
			)
			.bind(userId, limit, offset)
			.all<DbLogEntry>();

		return res.results || [];
	}

	async countForUser(userId: string): Promise<number> {
		const res = await this.db
			.prepare(
				`SELECT COUNT(*) AS total FROM logs
				 WHERE (consumer_id = ? OR credential_owner_id = ?)
				   AND status = 'ok'`,
			)
			.bind(userId, userId)
			.first<{ total: number }>();
		return res?.total ?? 0;
	}

	async get24hStats(
		userId: string,
	): Promise<{ earnings: number; apiCalls: number }> {
		const since = Date.now() - 24 * 60 * 60 * 1000;
		const res = await this.db
			.prepare(
				`SELECT
					COALESCE(SUM(CASE WHEN credential_owner_id = ?1 AND consumer_id != ?1 THEN provider_earned ELSE 0 END), 0) AS earnings,
					COUNT(CASE WHEN consumer_id = ?1 THEN 1 END) AS api_calls
				 FROM logs
				 WHERE created_at >= ?2 AND (consumer_id = ?1 OR credential_owner_id = ?1)
				   AND status = 'ok'`,
			)
			.bind(userId, since)
			.first<{ earnings: number; api_calls: number }>();
		return {
			earnings: res?.earnings ?? 0,
			apiCalls: res?.api_calls ?? 0,
		};
	}

	async getEarningsByCredential(
		credentialOwnerId: string,
	): Promise<Map<string, number>> {
		const res = await this.db
			.prepare(
				`SELECT credential_id, SUM(provider_earned) as total
				 FROM logs WHERE credential_owner_id = ? AND status = 'ok'
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

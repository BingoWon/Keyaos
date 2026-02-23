import type { DbUsageEntry } from "./schema";

export class UsageDao {
	constructor(private db: D1Database) {}

	async createEntry(
		tx: Omit<DbUsageEntry, "id" | "created_at">,
	): Promise<string> {
		const id = `tx_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO usage (
					id, consumer_id, credential_id, credential_owner_id, provider, model,
					input_tokens, output_tokens, base_cost,
					consumer_charged, provider_earned, platform_fee, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
				Date.now(),
			)
			.run();

		return id;
	}

	async getEntriesForUser(userId: string, limit = 50): Promise<DbUsageEntry[]> {
		const res = await this.db
			.prepare(
				`SELECT * FROM usage
				 WHERE consumer_id = ? OR credential_owner_id = ?
				 ORDER BY created_at DESC LIMIT ?`,
			)
			.bind(userId, userId, limit)
			.all<DbUsageEntry>();

		return res.results || [];
	}

	/** Sum provider_earned per credential for a given credential owner */
	async getEarningsByCredential(
		credentialOwnerId: string,
	): Promise<Map<string, number>> {
		const res = await this.db
			.prepare(
				`SELECT credential_id, SUM(provider_earned) as total
				 FROM usage WHERE credential_owner_id = ?
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

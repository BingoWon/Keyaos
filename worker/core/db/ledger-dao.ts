import type { DbLedgerEntry } from "./schema";

export class LedgerDao {
	constructor(private db: D1Database) {}

	async createEntry(
		tx: Omit<DbLedgerEntry, "id" | "created_at">,
	): Promise<string> {
		const id = `tx_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO ledger (
					id, owner_id, upstream_key_id, provider, model,
					input_tokens, output_tokens, credits_used, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				tx.owner_id,
				tx.upstream_key_id,
				tx.provider,
				tx.model,
				tx.input_tokens,
				tx.output_tokens,
				tx.credits_used,
				Date.now(),
			)
			.run();

		return id;
	}

	async getRecentEntries(
		owner_id: string,
		limit = 50,
	): Promise<DbLedgerEntry[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM ledger WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?",
			)
			.bind(owner_id, limit)
			.all<DbLedgerEntry>();

		return res.results || [];
	}
}

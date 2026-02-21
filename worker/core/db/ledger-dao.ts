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
					id, listing_id, provider, model,
					input_tokens, output_tokens, cost_cents, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				tx.listing_id,
				tx.provider,
				tx.model,
				tx.input_tokens,
				tx.output_tokens,
				tx.cost_cents,
				Date.now(),
			)
			.run();

		return id;
	}

	async getRecentEntries(limit = 50): Promise<DbLedgerEntry[]> {
		const res = await this.db
			.prepare("SELECT * FROM ledger ORDER BY created_at DESC LIMIT ?")
			.bind(limit)
			.all<DbLedgerEntry>();

		return res.results || [];
	}
}

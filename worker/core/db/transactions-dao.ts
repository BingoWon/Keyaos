/**
 * Transactions Data Access Object
 */
import type { DbTransaction } from "./schema";

export class TransactionsDao {
	constructor(private db: D1Database) {}

	async createTransaction(
		tx: Omit<DbTransaction, "id" | "created_at">,
	): Promise<string> {
		const id = `tx_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO transactions (
					id, key_id, provider, model,
					input_tokens, output_tokens, cost_cents, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				tx.key_id,
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

	async getRecentTransactions(limit = 50): Promise<DbTransaction[]> {
		const res = await this.db
			.prepare("SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?")
			.bind(limit)
			.all<DbTransaction>();

		return res.results || [];
	}
}

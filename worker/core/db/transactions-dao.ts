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
		const now = Date.now();

		await this.db
			.prepare(
				`INSERT INTO transactions (
					id, buyer_id, key_id, provider, model, 
					input_tokens, output_tokens, cost_cents, 
					seller_income_cents, platform_fee_cents, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				tx.buyer_id,
				tx.key_id,
				tx.provider,
				tx.model,
				tx.input_tokens,
				tx.output_tokens,
				tx.cost_cents,
				tx.seller_income_cents,
				tx.platform_fee_cents,
				now,
			)
			.run();

		return id;
	}

	async getTransactionsForBuyer(
		buyerId: string,
		limit: number = 50,
	): Promise<DbTransaction[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM transactions WHERE buyer_id = ? ORDER BY created_at DESC LIMIT ?",
			)
			.bind(buyerId, limit)
			.all<DbTransaction>();

		return res.results || [];
	}
}

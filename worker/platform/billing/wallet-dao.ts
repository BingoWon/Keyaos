export class WalletDao {
	constructor(private db: D1Database) {}

	async getBalance(ownerId: string): Promise<number> {
		const row = await this.db
			.prepare("SELECT balance FROM wallets WHERE owner_id = ?")
			.bind(ownerId)
			.first<{ balance: number }>();
		return row?.balance ?? 0;
	}

	async credit(ownerId: string, amount: number): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO wallets (owner_id, balance, updated_at)
				 VALUES (?, ?, ?)
				 ON CONFLICT(owner_id) DO UPDATE
				 SET balance = balance + excluded.balance, updated_at = excluded.updated_at`,
			)
			.bind(ownerId, amount, Date.now())
			.run();
	}

	async debit(ownerId: string, amount: number): Promise<boolean> {
		const res = await this.db
			.prepare(
				`UPDATE wallets SET balance = balance - ?, updated_at = ?
				 WHERE owner_id = ? AND balance >= ?`,
			)
			.bind(amount, Date.now(), ownerId, amount)
			.run();
		return (res.meta?.changes ?? 0) > 0;
	}

	/** Admin revocation: always succeeds, caps balance at 0 */
	async forceDebit(ownerId: string, amount: number): Promise<void> {
		await this.db
			.prepare(
				"UPDATE wallets SET balance = MAX(0, balance - ?), updated_at = ? WHERE owner_id = ?",
			)
			.bind(amount, Date.now(), ownerId)
			.run();
	}
}

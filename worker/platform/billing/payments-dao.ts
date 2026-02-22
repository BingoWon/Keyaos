export interface DbPayment {
	id: string;
	owner_id: string;
	stripe_session_id: string;
	amount_cents: number;
	credits: number;
	status: string;
	created_at: number;
}

export class PaymentsDao {
	constructor(private db: D1Database) {}

	async create(p: Omit<DbPayment, "id" | "created_at">): Promise<string> {
		const id = `pay_${crypto.randomUUID()}`;
		await this.db
			.prepare(
				`INSERT INTO payments (id, owner_id, stripe_session_id, amount_cents, credits, status, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				p.owner_id,
				p.stripe_session_id,
				p.amount_cents,
				p.credits,
				p.status,
				Date.now(),
			)
			.run();
		return id;
	}

	async markCompleted(sessionId: string): Promise<boolean> {
		const res = await this.db
			.prepare(
				"UPDATE payments SET status = 'completed' WHERE stripe_session_id = ? AND status = 'pending'",
			)
			.bind(sessionId)
			.run();
		return (res.meta?.changes ?? 0) > 0;
	}

	async isCompleted(sessionId: string): Promise<boolean> {
		const row = await this.db
			.prepare(
				"SELECT 1 FROM payments WHERE stripe_session_id = ? AND status = 'completed'",
			)
			.bind(sessionId)
			.first();
		return !!row;
	}

	async getHistory(
		ownerId: string,
		limit = 50,
	): Promise<DbPayment[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM payments WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?",
			)
			.bind(ownerId, limit)
			.all<DbPayment>();
		return res.results || [];
	}
}

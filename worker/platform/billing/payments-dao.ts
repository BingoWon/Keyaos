export interface DbPayment {
	id: string;
	owner_id: string;
	type: "manual" | "auto";
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
				`INSERT INTO payments (id, owner_id, type, stripe_session_id, amount_cents, credits, status, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				p.owner_id,
				p.type,
				p.stripe_session_id,
				p.amount_cents,
				p.credits,
				p.status,
				Date.now(),
			)
			.run();
		return id;
	}

	async transition(
		sessionId: string,
		to: "completed" | "expired" | "canceled",
	): Promise<boolean> {
		const res = await this.db
			.prepare(
				"UPDATE payments SET status = ? WHERE stripe_session_id = ? AND status = 'pending'",
			)
			.bind(to, sessionId)
			.run();
		return (res.meta?.changes ?? 0) > 0;
	}

	async isFinal(sessionId: string): Promise<boolean> {
		const row = await this.db
			.prepare(
				"SELECT 1 FROM payments WHERE stripe_session_id = ? AND status IN ('completed', 'expired', 'canceled')",
			)
			.bind(sessionId)
			.first();
		return !!row;
	}

	async cancelUserPending(ownerId: string): Promise<number> {
		const res = await this.db
			.prepare(
				"UPDATE payments SET status = 'canceled' WHERE owner_id = ? AND status = 'pending'",
			)
			.bind(ownerId)
			.run();
		return res.meta?.changes ?? 0;
	}

	async getHistory(ownerId: string, limit = 50): Promise<DbPayment[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM payments WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?",
			)
			.bind(ownerId, limit)
			.all<DbPayment>();
		return res.results || [];
	}
}

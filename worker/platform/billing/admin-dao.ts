export interface PlatformOverview {
	totalRevenue: number;
	totalConsumption: number;
	totalServiceFees: number;
	totalRequests: number;
	activeCredentials: number;
	registeredUsers: number;
}

export interface UserRow {
	ownerId: string;
	balance: number;
	totalToppedUp: number;
	totalConsumed: number;
	credentialsShared: number;
}

export class AdminDao {
	constructor(private db: D1Database) {}

	async getOverview(): Promise<PlatformOverview> {
		const [revenue, ledgerAgg, creds, users] = await Promise.all([
			this.db
				.prepare(
					"SELECT COALESCE(SUM(credits), 0) AS total FROM payments WHERE status = 'completed'",
				)
				.first<{ total: number }>(),
			this.db
				.prepare(
					`SELECT COUNT(*) AS cnt,
					        COALESCE(SUM(consumer_charged), 0) AS consumed,
					        COALESCE(SUM(platform_fee), 0) AS fees
					 FROM ledger`,
				)
				.first<{ cnt: number; consumed: number; fees: number }>(),
			this.db
				.prepare(
					"SELECT COUNT(*) AS cnt FROM upstream_credentials WHERE is_enabled = 1",
				)
				.first<{ cnt: number }>(),
			this.db
				.prepare("SELECT COUNT(*) AS cnt FROM wallets")
				.first<{ cnt: number }>(),
		]);

		return {
			totalRevenue: revenue?.total ?? 0,
			totalConsumption: ledgerAgg?.consumed ?? 0,
			totalServiceFees: ledgerAgg?.fees ?? 0,
			totalRequests: ledgerAgg?.cnt ?? 0,
			activeCredentials: creds?.cnt ?? 0,
			registeredUsers: users?.cnt ?? 0,
		};
	}

	async getUsers(): Promise<UserRow[]> {
		const rows = await this.db
			.prepare(
				`SELECT
					w.owner_id,
					w.balance,
					COALESCE(p.topped_up, 0) AS topped_up,
					COALESCE(l.consumed, 0) AS consumed,
					COALESCE(c.shared, 0) AS shared
				 FROM wallets w
				 LEFT JOIN (
					SELECT owner_id, SUM(credits) AS topped_up
					FROM payments WHERE status = 'completed'
					GROUP BY owner_id
				 ) p ON p.owner_id = w.owner_id
				 LEFT JOIN (
					SELECT consumer_id, SUM(consumer_charged) AS consumed
					FROM ledger
					GROUP BY consumer_id
				 ) l ON l.consumer_id = w.owner_id
				 LEFT JOIN (
					SELECT owner_id, COUNT(*) AS shared
					FROM upstream_credentials WHERE is_enabled = 1
					GROUP BY owner_id
				 ) c ON c.owner_id = w.owner_id
				 ORDER BY w.balance DESC`,
			)
			.all<{
				owner_id: string;
				balance: number;
				topped_up: number;
				consumed: number;
				shared: number;
			}>();

		return (rows.results || []).map((r) => ({
			ownerId: r.owner_id,
			balance: r.balance,
			totalToppedUp: r.topped_up,
			totalConsumed: r.consumed,
			credentialsShared: r.shared,
		}));
	}

	async adjustCredits(
		ownerId: string,
		amount: number,
		reason: string,
	): Promise<void> {
		const id = `adj_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
		const now = Date.now();

		await this.db
			.prepare(
				"INSERT INTO credit_adjustments (id, owner_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)",
			)
			.bind(id, ownerId, amount, reason, now)
			.run();

		if (amount > 0) {
			await this.db
				.prepare(
					`INSERT INTO wallets (owner_id, balance, updated_at) VALUES (?, ?, ?)
					 ON CONFLICT(owner_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = excluded.updated_at`,
				)
				.bind(ownerId, amount, now)
				.run();
		} else if (amount < 0) {
			await this.db
				.prepare(
					"UPDATE wallets SET balance = MAX(0, balance + ?), updated_at = ? WHERE owner_id = ?",
				)
				.bind(amount, now, ownerId)
				.run();
		}
	}

	async queryTable(
		table: string,
		limit: number,
		offset: number,
	): Promise<{ rows: unknown[]; total: number }> {
		const allowed = [
			"api_keys",
			"upstream_credentials",
			"model_pricing",
			"ledger",
			"wallets",
			"payments",
			"credit_adjustments",
		];
		if (!allowed.includes(table)) {
			throw new Error(`Table "${table}" is not queryable`);
		}

		const [data, count] = await Promise.all([
			this.db
				.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`)
				.bind(limit, offset)
				.all(),
			this.db
				.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`)
				.first<{ cnt: number }>(),
		]);

		return {
			rows: data.results || [],
			total: count?.cnt ?? 0,
		};
	}
}

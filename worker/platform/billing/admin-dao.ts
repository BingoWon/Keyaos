import { WalletDao } from "./wallet-dao";

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

const QUERYABLE_TABLES: Record<string, string> = {
	logs: "created_at",
	upstream_credentials: "created_at",
	wallets: "updated_at",
	payments: "created_at",
	api_keys: "created_at",
	model_pricing: "provider",
	credit_adjustments: "created_at",
};

export class AdminDao {
	private wallet: WalletDao;
	constructor(private db: D1Database) {
		this.wallet = new WalletDao(db);
	}

	async getOverview(): Promise<PlatformOverview> {
		const [revenue, logsAgg, creds, users] = await Promise.all([
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
					 FROM logs`,
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
			totalConsumption: logsAgg?.consumed ?? 0,
			totalServiceFees: logsAgg?.fees ?? 0,
			totalRequests: logsAgg?.cnt ?? 0,
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
					FROM logs
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

		await this.db
			.prepare(
				"INSERT INTO credit_adjustments (id, owner_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)",
			)
			.bind(id, ownerId, amount, reason, Date.now())
			.run();

		if (amount > 0) {
			await this.wallet.credit(ownerId, amount);
		} else if (amount < 0) {
			await this.wallet.debit(ownerId, -amount);
		}
	}

	async getAdjustments(
		limit: number,
		offset: number,
	): Promise<{ rows: unknown[]; total: number }> {
		const [data, count] = await Promise.all([
			this.db
				.prepare(
					"SELECT * FROM credit_adjustments ORDER BY created_at DESC LIMIT ? OFFSET ?",
				)
				.bind(limit, offset)
				.all(),
			this.db
				.prepare("SELECT COUNT(*) AS cnt FROM credit_adjustments")
				.first<{ cnt: number }>(),
		]);
		return { rows: data.results || [], total: count?.cnt ?? 0 };
	}

	/**
	 * Aggregated candle activity for admin overview charts.
	 * Returns hourly buckets of volume, total_tokens, and record count.
	 */
	async getActivity(
		hours: number,
	): Promise<
		{ time: number; volume: number; tokens: number; records: number }[]
	> {
		const since = Date.now() - hours * 60 * 60 * 1000;
		const bucketMs = hours <= 24 ? 3600000 : 3600000 * 6;
		const res = await this.db
			.prepare(
				`SELECT
					(interval_start / ? * ?) AS bucket,
					COALESCE(SUM(volume), 0) AS volume,
					COALESCE(SUM(total_tokens), 0) AS tokens,
					COUNT(*) AS records
				 FROM price_candles
				 WHERE interval_start >= ?
				 GROUP BY bucket
				 ORDER BY bucket ASC`,
			)
			.bind(bucketMs, bucketMs, since)
			.all<{
				bucket: number;
				volume: number;
				tokens: number;
				records: number;
			}>();

		return (res.results || []).map((r) => ({
			time: r.bucket,
			volume: r.volume,
			tokens: r.tokens,
			records: r.records,
		}));
	}

	async queryTable(
		table: string,
		limit: number,
		offset: number,
	): Promise<{ rows: unknown[]; total: number }> {
		const orderCol = QUERYABLE_TABLES[table];
		if (!orderCol) {
			throw new Error(`Table "${table}" is not queryable`);
		}

		const orderClause =
			orderCol === "provider"
				? `ORDER BY ${orderCol} ASC`
				: `ORDER BY ${orderCol} DESC`;

		const [data, count] = await Promise.all([
			this.db
				.prepare(`SELECT * FROM ${table} ${orderClause} LIMIT ? OFFSET ?`)
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

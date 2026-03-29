import { WalletDao } from "./wallet-dao";

export interface PlatformOverview {
	totalRevenue: number;
	totalConsumption: number;
	totalServiceFees: number;
	totalRequests: number;
	activeCredentials: number;
	registeredUsers: number;
	activeUsers: number;
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
	model_catalog: "provider_id",
	credit_adjustments: "created_at",
	auto_topup_config: "owner_id",
	chat_threads: "updated_at",
	chat_messages: "created_at",
	werewolf_sessions: "created_at",
	werewolf_characters: "created_at",
};

export class AdminDao {
	private wallet: WalletDao;
	constructor(
		private db: D1Database,
		private clerkSecretKey?: string,
	) {
		this.wallet = new WalletDao(db);
	}

	async getOverview(): Promise<PlatformOverview> {
		const [revenue, logsAgg, creds, wallets, clerkCount] = await Promise.all([
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
					 FROM logs WHERE status = 'ok'`,
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
			this.fetchClerkUserCount(),
		]);

		const activeUsers = wallets?.cnt ?? 0;

		return {
			totalRevenue: revenue?.total ?? 0,
			totalConsumption: logsAgg?.consumed ?? 0,
			totalServiceFees: logsAgg?.fees ?? 0,
			totalRequests: logsAgg?.cnt ?? 0,
			activeCredentials: creds?.cnt ?? 0,
			registeredUsers: clerkCount ?? activeUsers,
			activeUsers,
		};
	}

	private async fetchClerkUserCount(): Promise<number | null> {
		if (!this.clerkSecretKey) return null;
		try {
			const res = await fetch("https://api.clerk.com/v1/users/count", {
				headers: { Authorization: `Bearer ${this.clerkSecretKey}` },
			});
			if (!res.ok) return null;
			const data = (await res.json()) as { total_count: number };
			return data.total_count;
		} catch {
			return null;
		}
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
					FROM logs WHERE status = 'ok'
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
	 * Activity data for admin charts.
	 * Always returns total + self-use breakdown via conditional aggregation
	 * in a single query — the frontend decides which view to render.
	 */
	async getActivity(hours: number) {
		const since = Date.now() - hours * 60 * 60 * 1000;
		// 24h → 5 min, 3d → 30 min, 7d → 2 hr
		const bucketMs =
			hours <= 24 ? 300_000 : hours <= 72 ? 1_800_000 : 7_200_000;

		const res = await this.db
			.prepare(
				`SELECT
					(created_at / ${bucketMs} * ${bucketMs}) AS bucket,
					COUNT(*) AS volume,
					COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
					SUM(CASE WHEN consumer_id = credential_owner_id THEN 1 ELSE 0 END) AS self_volume,
					COALESCE(SUM(CASE WHEN consumer_id = credential_owner_id THEN input_tokens + output_tokens ELSE 0 END), 0) AS self_tokens
				 FROM logs
				 WHERE status = 'ok' AND created_at >= ?
				 GROUP BY bucket
				 ORDER BY bucket ASC`,
			)
			.bind(since)
			.all<{
				bucket: number;
				volume: number;
				tokens: number;
				self_volume: number;
				self_tokens: number;
			}>();

		return (res.results || []).map((r) => ({
			time: r.bucket,
			volume: r.volume,
			tokens: r.tokens,
			selfVolume: r.self_volume,
			selfTokens: r.self_tokens,
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
			orderCol === "provider_id"
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

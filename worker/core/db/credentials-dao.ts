import type { DbCredential } from "./schema";

/** Subscription-based credentials use a 5-hour cooldown before auto-recovery */
const COOLDOWN_MS = 5 * 60 * 60 * 1000;

export class CredentialsDao {
	constructor(private db: D1Database) {}

	async add(params: {
		owner_id: string;
		provider: string;
		authType?: "api_key" | "oauth";
		secret: string;
		quota?: number | null;
		quotaSource?: "auto" | "manual" | null;
		isEnabled?: number;
		priceMultiplier?: number;
		metadata?: Record<string, unknown> | null;
	}): Promise<DbCredential> {
		const id = `cred_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO upstream_credentials (
					id, owner_id, provider, auth_type, secret,
					quota, quota_source,
					is_enabled, price_multiplier,
					health_status, metadata, added_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)`,
			)
			.bind(
				id,
				params.owner_id,
				params.provider,
				params.authType ?? "api_key",
				params.secret,
				params.quota ?? null,
				params.quotaSource ?? null,
				params.isEnabled ?? 1,
				params.priceMultiplier ?? 1.0,
				params.metadata ? JSON.stringify(params.metadata) : null,
				Date.now(),
			)
			.run();

		const cred = await this.get(id, params.owner_id);
		if (!cred) throw new Error("Failed to retrieve newly added credential");
		return cred;
	}

	async get(id: string, owner_id: string): Promise<DbCredential | null> {
		return this.db
			.prepare(
				"SELECT * FROM upstream_credentials WHERE id = ? AND owner_id = ?",
			)
			.bind(id, owner_id)
			.first<DbCredential>();
	}

	async findBySecret(secret: string): Promise<DbCredential | null> {
		return this.db
			.prepare("SELECT * FROM upstream_credentials WHERE secret = ?")
			.bind(secret)
			.first<DbCredential>();
	}

	async remove(id: string, owner_id: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM upstream_credentials WHERE id = ? AND owner_id = ?")
			.bind(id, owner_id)
			.run();
		return result.success && result.meta?.rows_written === 1;
	}

	/**
	 * Select credentials available for dispatching.
	 * Excludes: dead, disabled, and cooldown credentials still within their window.
	 * When ownerId is omitted (platform mode), pools from ALL users' credentials.
	 */
	async selectAvailable(
		provider: string,
		ownerId?: string,
	): Promise<DbCredential[]> {
		const now = Date.now();

		if (ownerId) {
			const res = await this.db
				.prepare(
					`SELECT * FROM upstream_credentials
					 WHERE provider = ? AND owner_id = ? AND is_enabled = 1
					   AND health_status != 'dead'
					   AND (health_status != 'cooldown' OR last_health_check + ? < ?)
					 ORDER BY price_multiplier ASC, COALESCE(quota, 9999999) DESC`,
				)
				.bind(provider, ownerId, COOLDOWN_MS, now)
				.all<DbCredential>();
			return res.results || [];
		}

		const res = await this.db
			.prepare(
				`SELECT * FROM upstream_credentials
				 WHERE provider = ? AND is_enabled = 1
				   AND health_status != 'dead'
				   AND (health_status != 'cooldown' OR last_health_check + ? < ?)
				 ORDER BY price_multiplier ASC, COALESCE(quota, 9999999) DESC`,
			)
			.bind(provider, COOLDOWN_MS, now)
			.all<DbCredential>();
		return res.results || [];
	}

	async getAll(owner_id: string): Promise<DbCredential[]> {
		const res = await this.db
			.prepare("SELECT * FROM upstream_credentials WHERE owner_id = ?")
			.bind(owner_id)
			.all<DbCredential>();
		return res.results || [];
	}

	async getGlobal(): Promise<DbCredential[]> {
		const res = await this.db
			.prepare("SELECT * FROM upstream_credentials")
			.all<DbCredential>();
		return res.results || [];
	}

	async deductQuota(id: string, amount: number): Promise<void> {
		await this.db
			.prepare(
				`UPDATE upstream_credentials
				 SET quota = CASE WHEN quota IS NOT NULL THEN MAX(quota - ?, 0) ELSE NULL END,
				     health_status = CASE
				         WHEN quota IS NOT NULL AND quota - ? <= 0 THEN 'degraded'
				         ELSE health_status
				     END
				 WHERE id = ?`,
			)
			.bind(amount, amount, id)
			.run();
	}

	async updateQuota(
		id: string,
		quota: number,
		source?: "auto" | "manual",
	): Promise<void> {
		if (source) {
			await this.db
				.prepare(
					"UPDATE upstream_credentials SET quota = ?, quota_source = ? WHERE id = ?",
				)
				.bind(quota, source, id)
				.run();
		} else {
			await this.db
				.prepare("UPDATE upstream_credentials SET quota = ? WHERE id = ?")
				.bind(quota, id)
				.run();
		}
	}

	async updateSettings(
		id: string,
		isEnabled: number,
		priceMultiplier: number,
	): Promise<void> {
		await this.db
			.prepare(
				"UPDATE upstream_credentials SET is_enabled = ?, price_multiplier = ? WHERE id = ?",
			)
			.bind(isEnabled, priceMultiplier, id)
			.run();
	}

	async reportSuccess(id: string): Promise<void> {
		await this.db
			.prepare(
				"UPDATE upstream_credentials SET health_status = 'ok', last_health_check = ? WHERE id = ?",
			)
			.bind(Date.now(), id)
			.run();
	}

	/**
	 * Record an upstream failure.
	 * - Subscription providers: first failure → cooldown (auto-recovers after 5h);
	 *   failure after cooldown recovery → dead (needs manual intervention).
	 * - Balance providers: 401/402/403 → dead; others → degraded.
	 */
	async reportFailure(
		id: string,
		statusCode?: number,
		isSubscription?: boolean,
	): Promise<void> {
		let status: string;
		if (isSubscription) {
			const cred = await this.db
				.prepare("SELECT health_status FROM upstream_credentials WHERE id = ?")
				.bind(id)
				.first<{ health_status: string }>();
			// First failure or currently ok → cooldown; already was cooldown → dead
			status = cred?.health_status === "cooldown" ? "dead" : "cooldown";
		} else {
			status =
				statusCode === 401 || statusCode === 402 || statusCode === 403
					? "dead"
					: "degraded";
		}

		await this.db
			.prepare(
				"UPDATE upstream_credentials SET health_status = ?, last_health_check = ? WHERE id = ?",
			)
			.bind(status, Date.now(), id)
			.run();
	}

	async getStats(owner_id: string): Promise<{
		total: number;
		activeProviders: number;
		dead: number;
		totalQuota: number;
	}> {
		const all = await this.getAll(owner_id);
		const providerSet = new Set<string>();
		let dead = 0;
		let totalQuota = 0;
		for (const c of all) {
			totalQuota += c.quota ?? 0;
			if (c.health_status === "dead") dead++;
			else if (c.is_enabled === 1) providerSet.add(c.provider);
		}
		return {
			total: all.length,
			activeProviders: providerSet.size,
			dead,
			totalQuota,
		};
	}
}

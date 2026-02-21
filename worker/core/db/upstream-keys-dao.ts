import type { DbUpstreamKey } from "./schema";

export class UpstreamKeysDao {
	constructor(private db: D1Database) {}

	async add(params: {
		owner_id: string;
		provider: string;
		apiKey: string;
		quota?: number;
		quotaSource?: "auto" | "manual";
		isEnabled?: number;
		priceMultiplier?: number;
	}): Promise<DbUpstreamKey> {
		const id = `uk_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO upstream_keys (
					id, owner_id, provider, api_key,
					quota, quota_source,
					is_enabled, price_multiplier,
					health_status, added_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?)`,
			)
			.bind(
				id,
				params.owner_id,
				params.provider,
				params.apiKey,
				params.quota ?? 0.0,
				params.quotaSource ?? "manual",
				params.isEnabled ?? 1,
				params.priceMultiplier ?? 1.0,
				Date.now(),
			)
			.run();

		const key = await this.get(id, params.owner_id);
		if (!key) throw new Error("Failed to retrieve newly added upstream key");
		return key;
	}

	async get(id: string, owner_id: string): Promise<DbUpstreamKey | null> {
		return this.db
			.prepare("SELECT * FROM upstream_keys WHERE id = ? AND owner_id = ?")
			.bind(id, owner_id)
			.first<DbUpstreamKey>();
	}

	async findByApiKey(apiKey: string): Promise<DbUpstreamKey | null> {
		return this.db
			.prepare("SELECT * FROM upstream_keys WHERE api_key = ?")
			.bind(apiKey)
			.first<DbUpstreamKey>();
	}

	async remove(id: string, owner_id: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM upstream_keys WHERE id = ? AND owner_id = ?")
			.bind(id, owner_id)
			.run();
		return result.success && result.meta?.rows_written === 1;
	}

	/** Returns all eligible upstream keys for a provider, sorted by cheapest multiplier then highest quota */
	async selectAvailable(
		provider: string,
		owner_id: string,
	): Promise<DbUpstreamKey[]> {
		const res = await this.db
			.prepare(
				`SELECT * FROM upstream_keys
				 WHERE provider = ? AND owner_id = ? AND is_enabled = 1 AND health_status != 'dead'
				 ORDER BY price_multiplier ASC, quota DESC`,
			)
			.bind(provider, owner_id)
			.all<DbUpstreamKey>();
		return res.results || [];
	}

	async getAll(owner_id: string): Promise<DbUpstreamKey[]> {
		const res = await this.db
			.prepare("SELECT * FROM upstream_keys WHERE owner_id = ?")
			.bind(owner_id)
			.all<DbUpstreamKey>();
		return res.results || [];
	}

	async getGlobal(): Promise<DbUpstreamKey[]> {
		const res = await this.db
			.prepare("SELECT * FROM upstream_keys")
			.all<DbUpstreamKey>();
		return res.results || [];
	}

	async deductQuota(id: string, amount: number): Promise<void> {
		await this.db
			.prepare(
				`UPDATE upstream_keys
				 SET quota = MAX(quota - ?, 0),
				     health_status = CASE WHEN quota - ? <= 0 THEN 'dead' ELSE health_status END
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
					"UPDATE upstream_keys SET quota = ?, quota_source = ? WHERE id = ?",
				)
				.bind(quota, source, id)
				.run();
		} else {
			await this.db
				.prepare("UPDATE upstream_keys SET quota = ? WHERE id = ?")
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
				"UPDATE upstream_keys SET is_enabled = ?, price_multiplier = ? WHERE id = ?",
			)
			.bind(isEnabled, priceMultiplier, id)
			.run();
	}

	async reportSuccess(id: string): Promise<void> {
		await this.db
			.prepare(
				"UPDATE upstream_keys SET health_status = 'ok', last_health_check = ? WHERE id = ?",
			)
			.bind(Date.now(), id)
			.run();
	}

	async reportFailure(id: string, statusCode?: number): Promise<void> {
		const status =
			statusCode === 401 || statusCode === 402 || statusCode === 403
				? "dead"
				: "degraded";
		await this.db
			.prepare(
				"UPDATE upstream_keys SET health_status = ?, last_health_check = ? WHERE id = ?",
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
		for (const k of all) {
			totalQuota += k.quota;
			if (k.health_status === "dead") dead++;
			else if (k.is_enabled === 1) providerSet.add(k.provider);
		}
		return {
			total: all.length,
			activeProviders: providerSet.size,
			dead,
			totalQuota,
		};
	}
}

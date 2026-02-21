import type { DbQuotaListing } from "./schema";

export class QuotasDao {
	constructor(private db: D1Database) { }

	async addListing(params: {
		provider: string;
		apiKey: string;
		quota?: number;
		quotaSource?: "auto" | "manual";
		isEnabled?: number;
		priceMultiplier?: number;
	}): Promise<DbQuotaListing> {
		const id = `listing_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO quota_listings (
					id, provider, api_key,
					quota, quota_source,
					is_enabled, price_multiplier,
					health_status, added_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', ?)`,
			)
			.bind(
				id,
				params.provider,
				params.apiKey,
				params.quota ?? 0.0,
				params.quotaSource ?? "manual",
				params.isEnabled ?? 1,
				params.priceMultiplier ?? 1.0,
				Date.now(),
			)
			.run();

		const listing = await this.getListing(id);
		if (!listing) throw new Error("Failed to retrieve newly added listing");
		return listing;
	}

	async getListing(id: string): Promise<DbQuotaListing | null> {
		return this.db
			.prepare("SELECT * FROM quota_listings WHERE id = ?")
			.bind(id)
			.first<DbQuotaListing>();
	}

	async findByApiKey(apiKey: string): Promise<DbQuotaListing | null> {
		return this.db
			.prepare("SELECT * FROM quota_listings WHERE api_key = ?")
			.bind(apiKey)
			.first<DbQuotaListing>();
	}

	async deleteListing(id: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM quota_listings WHERE id = ?")
			.bind(id)
			.run();
		return result.success && result.meta?.rows_written === 1;
	}

	/** Select the best available listing — prefer listings with more quota */
	async selectListing(provider: string): Promise<DbQuotaListing | null> {
		return this.db
			.prepare(
				`SELECT * FROM quota_listings
				 WHERE provider = ? AND is_enabled = 1 AND health_status != 'dead'
				 ORDER BY quota DESC
				 LIMIT 1`,
			)
			.bind(provider)
			.first<DbQuotaListing>();
	}

	async getAllListings(): Promise<DbQuotaListing[]> {
		const res = await this.db
			.prepare("SELECT * FROM quota_listings")
			.all<DbQuotaListing>();
		return res.results || [];
	}

	async deductQuota(id: string, amount: number): Promise<void> {
		await this.db
			.prepare(
				`UPDATE quota_listings
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
					"UPDATE quota_listings SET quota = ?, quota_source = ? WHERE id = ?",
				)
				.bind(quota, source, id)
				.run();
		} else {
			await this.db
				.prepare("UPDATE quota_listings SET quota = ? WHERE id = ?")
				.bind(quota, id)
				.run();
		}
	}
	async updateListingSettings(
		id: string,
		isEnabled: number,
		priceMultiplier: number,
	): Promise<void> {
		await this.db
			.prepare(
				"UPDATE quota_listings SET is_enabled = ?, price_multiplier = ? WHERE id = ?",
			)
			.bind(isEnabled, priceMultiplier, id)
			.run();
	}
	async reportSuccess(id: string): Promise<void> {
		await this.db
			.prepare(
				"UPDATE quota_listings SET health_status = 'ok', last_health_check = ? WHERE id = ?",
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
				`UPDATE quota_listings
				 SET health_status = ?,
				     last_health_check = ?
				 WHERE id = ?`,
			)
			.bind(status, Date.now(), id)
			.run();
	}

	async getStats(): Promise<{
		totalListings: number;
		activeProviders: number;
		deadListings: number;
		totalQuota: number;
	}> {
		const all = await this.getAllListings();
		const providerSet = new Set<string>();
		let deadListings = 0;
		let totalQuota = 0;
		for (const l of all) {
			totalQuota += l.quota;
			if (l.health_status === "dead") deadListings++;
			else if (l.is_enabled === 1) providerSet.add(l.provider);
		}
		return {
			totalListings: all.length,
			activeProviders: providerSet.size,
			deadListings,
			totalQuota,
		};
	}
}

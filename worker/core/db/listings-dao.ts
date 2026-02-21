import type { DbCreditListing } from "./schema";

export class ListingsDao {
	constructor(private db: D1Database) {}

	async addListing(params: {
		provider: string;
		apiKey: string;
		creditsCents?: number;
		creditsSource?: "auto" | "manual";
		isEnabled?: number;
		priceMultiplier?: number;
	}): Promise<DbCreditListing> {
		const id = `listing_${crypto.randomUUID()}`;

		await this.db
			.prepare(
				`INSERT INTO credit_listings (
					id, provider, api_key,
					credits_cents, credits_source,
					is_enabled, price_multiplier,
					health_status, added_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', ?)`,
			)
			.bind(
				id,
				params.provider,
				params.apiKey,
				params.creditsCents ?? 0,
				params.creditsSource ?? "manual",
				params.isEnabled ?? 1,
				params.priceMultiplier ?? 1.0,
				Date.now(),
			)
			.run();

		const listing = await this.getListing(id);
		if (!listing) throw new Error("Failed to retrieve newly added listing");
		return listing;
	}

	async getListing(id: string): Promise<DbCreditListing | null> {
		return this.db
			.prepare("SELECT * FROM credit_listings WHERE id = ?")
			.bind(id)
			.first<DbCreditListing>();
	}

	async findByApiKey(apiKey: string): Promise<DbCreditListing | null> {
		return this.db
			.prepare("SELECT * FROM credit_listings WHERE api_key = ?")
			.bind(apiKey)
			.first<DbCreditListing>();
	}

	async deleteListing(id: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM credit_listings WHERE id = ?")
			.bind(id)
			.run();
		return result.success && result.meta?.rows_written === 1;
	}

	/** Select the best available listing — prefer listings with more credits */
	async selectListing(provider: string): Promise<DbCreditListing | null> {
		return this.db
			.prepare(
				`SELECT * FROM credit_listings
				 WHERE provider = ? AND is_enabled = 1 AND health_status != 'dead'
				 ORDER BY credits_cents DESC
				 LIMIT 1`,
			)
			.bind(provider)
			.first<DbCreditListing>();
	}

	async getAllListings(): Promise<DbCreditListing[]> {
		const res = await this.db
			.prepare("SELECT * FROM credit_listings")
			.all<DbCreditListing>();
		return res.results || [];
	}

	async deductCredits(id: string, cents: number): Promise<void> {
		await this.db
			.prepare(
				`UPDATE credit_listings
				 SET credits_cents = MAX(credits_cents - ?, 0),
				     health_status = CASE WHEN credits_cents - ? <= 0 THEN 'dead' ELSE health_status END
				 WHERE id = ?`,
			)
			.bind(cents, cents, id)
			.run();
	}

	async updateCredits(
		id: string,
		creditsCents: number,
		source?: "auto" | "manual",
	): Promise<void> {
		if (source) {
			await this.db
				.prepare(
					"UPDATE credit_listings SET credits_cents = ?, credits_source = ? WHERE id = ?",
				)
				.bind(creditsCents, source, id)
				.run();
		} else {
			await this.db
				.prepare("UPDATE credit_listings SET credits_cents = ? WHERE id = ?")
				.bind(creditsCents, id)
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
				"UPDATE credit_listings SET is_enabled = ?, price_multiplier = ? WHERE id = ?",
			)
			.bind(isEnabled, priceMultiplier, id)
			.run();
	}
	async reportSuccess(id: string): Promise<void> {
		await this.db
			.prepare(
				"UPDATE credit_listings SET health_status = 'ok', last_health_check = ? WHERE id = ?",
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
				`UPDATE credit_listings
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
		totalBalanceCents: number;
	}> {
		const all = await this.getAllListings();
		const providerSet = new Set<string>();
		let deadListings = 0;
		let totalBalanceCents = 0;
		for (const l of all) {
			totalBalanceCents += l.credits_cents;
			if (l.health_status === "dead") deadListings++;
			else if (l.is_enabled === 1) providerSet.add(l.provider);
		}
		return {
			totalListings: all.length,
			activeProviders: providerSet.size,
			deadListings,
			totalBalanceCents,
		};
	}
}

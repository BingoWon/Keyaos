import type { DbModelPricing } from "./schema";

export class PricingDao {
	constructor(private db: D1Database) {}

	async upsertPricing(
		models: Omit<DbModelPricing, "refreshed_at">[],
	): Promise<void> {
		const now = Date.now();
		const stmt = this.db.prepare(
			`INSERT INTO model_pricing (id, provider, upstream_id, display_name, input_price, output_price, context_length, is_active, refreshed_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
			 ON CONFLICT(id) DO UPDATE SET
			   display_name = excluded.display_name,
			   input_price = excluded.input_price,
			   output_price = excluded.output_price,
			   context_length = excluded.context_length,
			   is_active = 1,
			   refreshed_at = excluded.refreshed_at`,
		);

		const batch = models.map((m) =>
			stmt.bind(
				m.id,
				m.provider,
				m.upstream_id,
				m.display_name,
				m.input_price,
				m.output_price,
				m.context_length,
				now,
			),
		);

		for (let i = 0; i < batch.length; i += 100) {
			await this.db.batch(batch.slice(i, i + 100));
		}
	}

	async deactivateMissing(
		provider: string,
		activeIds: string[],
	): Promise<void> {
		if (activeIds.length === 0) return;

		const placeholders = activeIds.map(() => "?").join(",");
		await this.db
			.prepare(
				`UPDATE model_pricing SET is_active = 0
				 WHERE provider = ? AND id NOT IN (${placeholders})`,
			)
			.bind(provider, ...activeIds)
			.run();
	}

	async findByUpstreamId(upstreamId: string): Promise<DbModelPricing[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM model_pricing WHERE upstream_id = ? AND is_active = 1 ORDER BY input_price ASC",
			)
			.bind(upstreamId)
			.all<DbModelPricing>();
		return res.results || [];
	}

	async getActivePricing(): Promise<DbModelPricing[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM model_pricing WHERE is_active = 1 ORDER BY upstream_id, input_price ASC",
			)
			.all<DbModelPricing>();
		return res.results || [];
	}
}

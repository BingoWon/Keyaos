import type { DbModelPricing } from "./schema";

export class PricingDao {
	constructor(private db: D1Database) { }

	async upsertPricing(
		models: Omit<DbModelPricing, "refreshed_at" | "is_active">[],
	): Promise<void> {
		const now = Date.now();
		const stmt = this.db.prepare(
			`INSERT INTO model_pricing (id, provider, model_id, name, input_price, output_price, context_length, input_modalities, output_modalities, is_active, sort_order, upstream_model_id, metadata, created_at, refreshed_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
			   name = excluded.name,
			   input_price = excluded.input_price,
			   output_price = excluded.output_price,
			   context_length = excluded.context_length,
			   input_modalities = excluded.input_modalities,
			   output_modalities = excluded.output_modalities,
			   is_active = 1,
			   sort_order = excluded.sort_order,
			   upstream_model_id = excluded.upstream_model_id,
			   metadata = excluded.metadata,
			   refreshed_at = excluded.refreshed_at`,
		);

		const batch = models.map((m) =>
			stmt.bind(
				m.id,
				m.provider,
				m.model_id,
				m.name,
				m.input_price,
				m.output_price,
				m.context_length,
				m.input_modalities,
				m.output_modalities,
				m.sort_order,
				m.upstream_model_id,
				m.metadata,
				m.created_at,
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

		const activeSet = new Set(activeIds);
		const existing = await this.db
			.prepare(
				"SELECT id FROM model_pricing WHERE provider = ? AND is_active = 1",
			)
			.bind(provider)
			.all<{ id: string }>();

		const toDeactivate = (existing.results || [])
			.map((r) => r.id)
			.filter((id) => !activeSet.has(id));
		if (toDeactivate.length === 0) return;

		const stmt = this.db.prepare(
			"UPDATE model_pricing SET is_active = 0 WHERE id = ?",
		);
		for (let i = 0; i < toDeactivate.length; i += 100) {
			await this.db.batch(
				toDeactivate.slice(i, i + 100).map((id) => stmt.bind(id)),
			);
		}
	}

	async findByModelId(modelId: string): Promise<DbModelPricing[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM model_pricing WHERE model_id = ? AND is_active = 1 ORDER BY input_price ASC",
			)
			.bind(modelId)
			.all<DbModelPricing>();
		return res.results || [];
	}

	async getActivePricingWithBestMultiplier(): Promise<
		(DbModelPricing & { best_multiplier: number | null })[]
	> {
		const res = await this.db
			.prepare(
				`SELECT mp.*, MIN(c.price_multiplier) AS best_multiplier
				 FROM model_pricing mp
				 LEFT JOIN upstream_credentials c
				   ON c.provider = mp.provider
				   AND c.is_enabled = 1
				   AND c.health_status NOT IN ('dead')
				 WHERE mp.is_active = 1
				 GROUP BY mp.id
				 ORDER BY mp.sort_order ASC, mp.input_price ASC`,
			)
			.all<DbModelPricing & { best_multiplier: number | null }>();
		return res.results || [];
	}
}

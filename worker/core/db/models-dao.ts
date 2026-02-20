/**
 * Models Data Access Object
 */
import type { DbModel } from "./schema";

export class ModelsDao {
	constructor(private db: D1Database) { }

	async upsertModels(models: Omit<DbModel, "synced_at">[]): Promise<void> {
		const now = Date.now();
		const stmt = this.db.prepare(
			`INSERT INTO models (id, provider, upstream_id, display_name, input_cost, output_cost, context_length, is_active, synced_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
			 ON CONFLICT(id) DO UPDATE SET
			   display_name = excluded.display_name,
			   input_cost = excluded.input_cost,
			   output_cost = excluded.output_cost,
			   context_length = excluded.context_length,
			   is_active = 1,
			   synced_at = excluded.synced_at`,
		);

		const batch = models.map((m) =>
			stmt.bind(
				m.id,
				m.provider,
				m.upstream_id,
				m.display_name,
				m.input_cost,
				m.output_cost,
				m.context_length,
				now,
			),
		);

		// D1 batch limit is 100 statements per batch
		for (let i = 0; i < batch.length; i += 100) {
			await this.db.batch(batch.slice(i, i + 100));
		}
	}

	async deactivateMissing(
		provider: string,
		activeIds: string[],
	): Promise<void> {
		if (activeIds.length === 0) {
			await this.db
				.prepare("UPDATE models SET is_active = 0 WHERE provider = ?")
				.bind(provider)
				.run();
			return;
		}

		// upsertModels() already sets is_active=1 and synced_at for current models.
		// Simply deactivate anything with an old synced_at timestamp.
		await this.db
			.prepare(
				"UPDATE models SET is_active = 0 WHERE provider = ? AND synced_at < ?",
			)
			.bind(provider, Date.now() - 1000)
			.run();
	}

	async findByUpstreamId(upstreamId: string): Promise<DbModel[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM models WHERE upstream_id = ? AND is_active = 1 ORDER BY input_cost ASC",
			)
			.bind(upstreamId)
			.all<DbModel>();
		return res.results || [];
	}

	async getActiveModels(): Promise<DbModel[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM models WHERE is_active = 1 ORDER BY upstream_id, input_cost ASC",
			)
			.all<DbModel>();
		return res.results || [];
	}
}

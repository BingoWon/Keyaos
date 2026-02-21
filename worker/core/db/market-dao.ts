import type { DbMarketQuote } from "./schema";

export class MarketDao {
	constructor(private db: D1Database) { }

	async upsertQuotes(
		quotes: Omit<DbMarketQuote, "refreshed_at">[],
	): Promise<void> {
		const now = Date.now();
		const stmt = this.db.prepare(
			`INSERT INTO market_quotes (id, provider, upstream_id, display_name, input_price, output_price, context_length, is_active, refreshed_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
			 ON CONFLICT(id) DO UPDATE SET
			   display_name = excluded.display_name,
			   input_price = excluded.input_price,
			   output_price = excluded.output_price,
			   context_length = excluded.context_length,
			   is_active = 1,
			   refreshed_at = excluded.refreshed_at`,
		);

		const batch = quotes.map((q) =>
			stmt.bind(
				q.id,
				q.provider,
				q.upstream_id,
				q.display_name,
				q.input_price,
				q.output_price,
				q.context_length,
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
		if (activeIds.length === 0) {
			await this.db
				.prepare("UPDATE market_quotes SET is_active = 0 WHERE provider = ?")
				.bind(provider)
				.run();
			return;
		}

		await this.db
			.prepare(
				"UPDATE market_quotes SET is_active = 0 WHERE provider = ? AND refreshed_at < ?",
			)
			.bind(provider, Date.now() - 1000)
			.run();
	}

	async findByUpstreamId(upstreamId: string): Promise<DbMarketQuote[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM market_quotes WHERE upstream_id = ? AND is_active = 1 ORDER BY input_price ASC",
			)
			.bind(upstreamId)
			.all<DbMarketQuote>();
		return res.results || [];
	}

	async getActiveQuotes(): Promise<DbMarketQuote[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM market_quotes WHERE is_active = 1 ORDER BY upstream_id, input_price ASC",
			)
			.all<DbMarketQuote>();
		return res.results || [];
	}
}

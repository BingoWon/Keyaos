import type { DbPriceCandle } from "./schema";

const INTERVAL_MS = 5 * 60 * 1000;

export class CandleDao {
	constructor(private db: D1Database) {}

	async aggregate(since: number): Promise<void> {
		const now = Date.now();
		const windowStart = since || now - INTERVAL_MS;

		const rows = await this.db
			.prepare(
				`SELECT
					provider, model, price_multiplier,
					input_tokens, output_tokens, base_cost, created_at
				 FROM usage
				 WHERE created_at >= ? AND created_at < ?
				 ORDER BY created_at ASC`,
			)
			.bind(windowStart, now)
			.all<{
				provider: string;
				model: string;
				price_multiplier: number;
				input_tokens: number;
				output_tokens: number;
				base_cost: number;
				created_at: number;
			}>();

		if (!rows.results?.length) return;

		const buckets = new Map<
			string,
			{
				open: number;
				high: number;
				low: number;
				close: number;
				volume: number;
				totalTokens: number;
			}
		>();

		for (const row of rows.results) {
			const interval =
				Math.floor(row.created_at / INTERVAL_MS) * INTERVAL_MS;
			const totalTokens = row.input_tokens + row.output_tokens;
			const pricePerM =
				totalTokens > 0 ? (row.base_cost / totalTokens) * 1_000_000 : 0;
			if (pricePerM <= 0) continue;

			for (const [dim, val] of [
				["model", row.model],
				["provider", row.provider],
			] as const) {
				const key = `${dim}|${val}|${interval}`;
				const b = buckets.get(key);
				if (b) {
					b.high = Math.max(b.high, pricePerM);
					b.low = Math.min(b.low, pricePerM);
					b.close = pricePerM;
					b.volume++;
					b.totalTokens += totalTokens;
				} else {
					buckets.set(key, {
						open: pricePerM,
						high: pricePerM,
						low: pricePerM,
						close: pricePerM,
						volume: 1,
						totalTokens,
					});
				}
			}
		}

		if (buckets.size === 0) return;

		const stmt = this.db.prepare(
			`INSERT INTO price_candles
				(dimension, dimension_value, interval_start, open_price, high_price, low_price, close_price, volume, total_tokens)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (dimension, dimension_value, interval_start) DO UPDATE SET
				high_price = MAX(price_candles.high_price, excluded.high_price),
				low_price  = MIN(price_candles.low_price, excluded.low_price),
				close_price = excluded.close_price,
				volume = price_candles.volume + excluded.volume,
				total_tokens = price_candles.total_tokens + excluded.total_tokens`,
		);

		const batch = [...buckets.entries()].map(([key, b]) => {
			const [dim, val, ts] = key.split("|");
			return stmt.bind(
				dim,
				val,
				Number(ts),
				b.open,
				b.high,
				b.low,
				b.close,
				b.volume,
				b.totalTokens,
			);
		});

		await this.db.batch(batch);
	}

	async getCandles(
		dimension: "model" | "provider",
		value: string,
		since: number,
		limit = 288,
	): Promise<DbPriceCandle[]> {
		const res = await this.db
			.prepare(
				`SELECT * FROM price_candles
				 WHERE dimension = ? AND dimension_value = ? AND interval_start >= ?
				 ORDER BY interval_start ASC LIMIT ?`,
			)
			.bind(dimension, value, since, limit)
			.all<DbPriceCandle>();
		return res.results || [];
	}
}

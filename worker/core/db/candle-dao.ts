import { log } from "../../shared/logger";
import type { DbPriceCandle } from "./schema";

const INTERVAL_MS = 60 * 1000;
const RETENTION_DAYS = 30;

export type CandleDimension =
	| "model:input"
	| "model:output"
	| "provider";

export class CandleDao {
	constructor(private db: D1Database) { }

	/**
	 * Aggregate real trade data into candles.
	 * - model:input  — OHLC of effective input price per M tokens
	 * - model:output — OHLC of effective output price per M tokens
	 * - provider     — OHLC of price_multiplier
	 */
	async aggregate(since: number): Promise<void> {
		const now = Date.now();
		const windowStart = since || now - INTERVAL_MS;

		const rows = await this.db
			.prepare(
				`SELECT u.provider, u.model, u.price_multiplier,
				        u.input_tokens, u.output_tokens, u.created_at,
				        mp.input_price, mp.output_price
				 FROM usage u
				 JOIN model_pricing mp
				   ON mp.provider = u.provider AND mp.model_id = u.model AND mp.is_active = 1
				 WHERE u.created_at >= ? AND u.created_at < ?
				 ORDER BY u.created_at ASC`,
			)
			.bind(windowStart, now)
			.all<{
				provider: string;
				model: string;
				price_multiplier: number;
				input_tokens: number;
				output_tokens: number;
				created_at: number;
				input_price: number;
				output_price: number;
			}>();

		if (!rows.results?.length) return;

		type Bucket = {
			dim: string;
			val: string;
			ts: number;
			open: number;
			high: number;
			low: number;
			close: number;
			volume: number;
			totalTokens: number;
		};
		const buckets = new Map<string, Bucket>();

		const upsert = (
			dim: string,
			val: string,
			interval: number,
			price: number,
			tokens: number,
		) => {
			const key = `${dim}\0${val}\0${interval}`;
			const b = buckets.get(key);
			if (b) {
				b.high = Math.max(b.high, price);
				b.low = Math.min(b.low, price);
				b.close = price;
				b.volume++;
				b.totalTokens += tokens;
			} else {
				buckets.set(key, {
					dim,
					val,
					ts: interval,
					open: price,
					high: price,
					low: price,
					close: price,
					volume: 1,
					totalTokens: tokens,
				});
			}
		};

		for (const row of rows.results) {
			const interval = Math.floor(row.created_at / INTERVAL_MS) * INTERVAL_MS;
			const mul = row.price_multiplier;

			const effectiveInput = row.input_price * mul;
			const effectiveOutput = row.output_price * mul;

			if (row.input_tokens > 0 && effectiveInput > 0) {
				upsert("model:input", row.model, interval, effectiveInput, row.input_tokens);
			}
			if (row.output_tokens > 0 && effectiveOutput > 0) {
				upsert("model:output", row.model, interval, effectiveOutput, row.output_tokens);
			}

			if (mul > 0) {
				upsert(
					"provider",
					row.provider,
					interval,
					mul,
					row.input_tokens + row.output_tokens,
				);
			}
		}

		if (buckets.size === 0) return;

		const stmt = this.db.prepare(
			`INSERT INTO price_candles
				(dimension, dimension_value, interval_start, open_price, high_price, low_price, close_price, volume, total_tokens)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (dimension, dimension_value, interval_start) DO UPDATE SET
				open_price  = excluded.open_price,
				high_price  = excluded.high_price,
				low_price   = excluded.low_price,
				close_price = excluded.close_price,
				volume      = excluded.volume,
				total_tokens = excluded.total_tokens`,
		);

		const batch = [...buckets.values()].map((b) =>
			stmt.bind(
				b.dim,
				b.val,
				b.ts,
				b.open,
				b.high,
				b.low,
				b.close,
				b.volume,
				b.totalTokens,
			),
		);

		for (let i = 0; i < batch.length; i += 100) {
			await this.db.batch(batch.slice(i, i + 100));
		}
	}

	/**
	 * Generate quoted candles for models and providers without real trades.
	 * - model:input  — MIN(input_price × price_multiplier)
	 * - model:output — MIN(output_price × price_multiplier)
	 * - provider     — MIN(price_multiplier)
	 * Uses volume=0 to distinguish from real trades. Deduplicates against previous interval.
	 */
	async generateQuotedCandles(): Promise<void> {
		const now = Date.now();
		const interval = Math.floor(now / INTERVAL_MS) * INTERVAL_MS;

		const [inputQuotes, outputQuotes, providerQuotes] = await Promise.all([
			this.db
				.prepare(
					`SELECT mp.model_id AS val, MIN(mp.input_price * c.price_multiplier) AS price
					 FROM model_pricing mp
					 JOIN upstream_credentials c ON c.provider = mp.provider
					 WHERE mp.is_active = 1 AND c.is_enabled = 1
					   AND c.health_status NOT IN ('dead') AND mp.input_price > 0
					 GROUP BY mp.model_id`,
				)
				.all<{ val: string; price: number }>(),
			this.db
				.prepare(
					`SELECT mp.model_id AS val, MIN(mp.output_price * c.price_multiplier) AS price
					 FROM model_pricing mp
					 JOIN upstream_credentials c ON c.provider = mp.provider
					 WHERE mp.is_active = 1 AND c.is_enabled = 1
					   AND c.health_status NOT IN ('dead') AND mp.output_price > 0
					 GROUP BY mp.model_id`,
				)
				.all<{ val: string; price: number }>(),
			this.db
				.prepare(
					`SELECT c.provider AS val, MIN(c.price_multiplier) AS price
					 FROM upstream_credentials c
					 WHERE c.is_enabled = 1 AND c.health_status NOT IN ('dead')
					 GROUP BY c.provider`,
				)
				.all<{ val: string; price: number }>(),
		]);

		const quotes: { dim: string; val: string; price: number }[] = [];
		for (const q of inputQuotes.results || []) {
			if (q.price > 0)
				quotes.push({ dim: "model:input", val: q.val, price: q.price });
		}
		for (const q of outputQuotes.results || []) {
			if (q.price > 0)
				quotes.push({ dim: "model:output", val: q.val, price: q.price });
		}
		for (const q of providerQuotes.results || []) {
			if (q.price > 0)
				quotes.push({ dim: "provider", val: q.val, price: q.price });
		}

		if (quotes.length === 0) return;

		const [existingRes, prevRes] = await Promise.all([
			this.db
				.prepare(
					"SELECT dimension, dimension_value FROM price_candles WHERE interval_start = ?",
				)
				.bind(interval)
				.all<{ dimension: string; dimension_value: string }>(),
			this.db
				.prepare(
					`SELECT dimension, dimension_value, close_price, volume
					 FROM price_candles WHERE interval_start = ?`,
				)
				.bind(interval - INTERVAL_MS)
				.all<{
					dimension: string;
					dimension_value: string;
					close_price: number;
					volume: number;
				}>(),
		]);

		const existing = new Set(
			(existingRes.results || []).map(
				(r) => `${r.dimension}\0${r.dimension_value}`,
			),
		);
		const prevMap = new Map(
			(prevRes.results || []).map((r) => [
				`${r.dimension}\0${r.dimension_value}`,
				r,
			]),
		);

		const toWrite = quotes.filter((q) => {
			const key = `${q.dim}\0${q.val}`;
			if (existing.has(key)) return false;
			const prev = prevMap.get(key);
			if (prev && prev.volume === 0 && prev.close_price === q.price)
				return false;
			return true;
		});

		if (toWrite.length === 0) return;

		const stmt = this.db.prepare(
			`INSERT INTO price_candles
				(dimension, dimension_value, interval_start, open_price, high_price, low_price, close_price, volume, total_tokens)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
			 ON CONFLICT DO NOTHING`,
		);

		const batch = toWrite.map((q) =>
			stmt.bind(q.dim, q.val, interval, q.price, q.price, q.price, q.price),
		);

		for (let i = 0; i < batch.length; i += 100) {
			await this.db.batch(batch.slice(i, i + 100));
		}

		log.info("candles", `Quoted ${toWrite.length} candles`);
	}

	async pruneOldCandles(): Promise<void> {
		const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
		await this.db
			.prepare("DELETE FROM price_candles WHERE interval_start < ?")
			.bind(cutoff)
			.run();
	}

	/**
	 * Get latest close prices for all items in a dimension.
	 * Returns a Map of dimension_value → close_price.
	 */
	async getLatestPrices(
		dimension: CandleDimension,
	): Promise<Map<string, number>> {
		const res = await this.db
			.prepare(
				`SELECT dimension_value, close_price
				 FROM price_candles
				 WHERE dimension = ?
				   AND interval_start = (
				     SELECT MAX(interval_start) FROM price_candles WHERE dimension = ?
				   )`,
			)
			.bind(dimension, dimension)
			.all<{ dimension_value: string; close_price: number }>();

		return new Map(
			(res.results || []).map((r) => [r.dimension_value, r.close_price]),
		);
	}

	/**
	 * Fetch candles with gap-filling: sparse DB rows are expanded into
	 * continuous 1-minute candles using the previous close price.
	 */
	async getCandles(
		dimension: CandleDimension,
		value: string,
		since: number,
		limit = 10080,
	): Promise<DbPriceCandle[]> {
		const [sparseRes, seedRes] = await Promise.all([
			this.db
				.prepare(
					`SELECT * FROM price_candles
					 WHERE dimension = ? AND dimension_value = ? AND interval_start >= ?
					 ORDER BY interval_start ASC LIMIT ?`,
				)
				.bind(dimension, value, since, limit)
				.all<DbPriceCandle>(),
			this.db
				.prepare(
					`SELECT close_price FROM price_candles
					 WHERE dimension = ? AND dimension_value = ? AND interval_start < ?
					 ORDER BY interval_start DESC LIMIT 1`,
				)
				.bind(dimension, value, since)
				.first<{ close_price: number }>(),
		]);

		const sparse = sparseRes.results || [];
		if (sparse.length === 0 && !seedRes) return [];

		const sparseMap = new Map<number, DbPriceCandle>();
		for (const c of sparse) sparseMap.set(c.interval_start, c);

		const filled: DbPriceCandle[] = [];
		const start = Math.floor(since / INTERVAL_MS) * INTERVAL_MS;
		const end = Math.floor(Date.now() / INTERVAL_MS) * INTERVAL_MS;
		let lastClose = seedRes?.close_price ?? sparse[0]?.open_price ?? 0;

		for (
			let ts = start;
			ts <= end && filled.length < limit;
			ts += INTERVAL_MS
		) {
			const existing = sparseMap.get(ts);
			if (existing) {
				filled.push(existing);
				lastClose = existing.close_price;
			} else if (lastClose > 0) {
				filled.push({
					dimension,
					dimension_value: value,
					interval_start: ts,
					open_price: lastClose,
					high_price: lastClose,
					low_price: lastClose,
					close_price: lastClose,
					volume: 0,
					total_tokens: 0,
				});
			}
		}

		return filled;
	}
}

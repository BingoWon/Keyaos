import { Hono } from "hono";
import { CandleDao, type CandleDimension } from "../core/db/candle-dao";
import { CredentialsDao } from "../core/db/credentials-dao";
import { UsageDao } from "../core/db/usage-dao";
import { getAllProviders } from "../core/providers/registry";
import type { AppEnv } from "../shared/types";

const systemRouter = new Hono<AppEnv>();

systemRouter.get("/me", (c) => {
	const ownerId = c.get("owner_id");
	const isAdmin =
		!!c.env.PLATFORM_OWNER_ID && ownerId === c.env.PLATFORM_OWNER_ID;
	return c.json({ ownerId, isAdmin });
});

systemRouter.get("/pool/stats", async (c) => {
	const dao = new CredentialsDao(c.env.DB);
	return c.json(await dao.getStats(c.get("owner_id")));
});

systemRouter.get("/providers", (c) => {
	const providers = getAllProviders().map((p) => ({
		id: p.info.id,
		name: p.info.name,
		logoUrl: p.info.logoUrl,
		supportsAutoCredits: p.info.supportsAutoCredits,
		authType: p.info.authType ?? "api_key",
		isSubscription: p.info.isSubscription ?? false,
		credentialGuide: p.info.credentialGuide ?? null,
	}));
	return c.json({ data: providers });
});

/** API usage records (per-request detail) */
systemRouter.get("/usage", async (c) => {
	const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
	const userId = c.get("owner_id");
	const dao = new UsageDao(c.env.DB);
	const entries = await dao.getEntriesForUser(userId, limit);

	return c.json({
		data: entries.map((tx) => {
			const isConsumer = tx.consumer_id === userId;
			const isProvider = tx.credential_owner_id === userId;

			let direction: "spent" | "earned" | "self";
			if (isConsumer && isProvider) direction = "self";
			else if (isConsumer) direction = "spent";
			else direction = "earned";

			const netCredits =
				direction === "spent"
					? -tx.consumer_charged
					: direction === "earned"
						? tx.provider_earned
						: 0;

			return {
				id: tx.id,
				direction,
				provider: tx.provider,
				model: tx.model,
				inputTokens: tx.input_tokens,
				outputTokens: tx.output_tokens,
				netCredits,
				createdAt: tx.created_at,
			};
		}),
	});
});

/**
 * Unified ledger: all credit movements in chronological order.
 * Combines usage (API spend/earn), payments (top-ups), and admin adjustments.
 */
systemRouter.get("/ledger", async (c) => {
	const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
	const userId = c.get("owner_id");
	const db = c.env.DB;

	const res = await db
		.prepare(
			`SELECT * FROM (
				SELECT
					id, 'usage' AS type,
					CASE WHEN consumer_id = ? THEN 'api_spend' ELSE 'credential_earn' END AS category,
					model AS description,
					CASE WHEN consumer_id = ? THEN -consumer_charged ELSE provider_earned END AS amount,
					created_at
				FROM usage
				WHERE (consumer_id = ? OR credential_owner_id = ?)
					AND NOT (consumer_id = ? AND credential_owner_id = ?)

				UNION ALL

				SELECT
					id, 'top_up' AS type,
					CASE WHEN type = 'auto' THEN 'auto_topup' ELSE 'top_up' END AS category,
					CASE WHEN type = 'auto' THEN 'Auto Top-Up' ELSE 'Stripe' END AS description,
					credits AS amount,
					created_at
				FROM payments
				WHERE owner_id = ? AND status = 'completed'

				UNION ALL

				SELECT
					id, 'adjustment' AS type,
					CASE WHEN amount >= 0 THEN 'grant' ELSE 'revoke' END AS category,
					COALESCE(reason, '') AS description,
					amount,
					created_at
				FROM credit_adjustments
				WHERE owner_id = ?
			) combined
			ORDER BY created_at DESC
			LIMIT ?`,
		)
		.bind(userId, userId, userId, userId, userId, userId, userId, userId, limit)
		.all<{
			id: string;
			type: "usage" | "top_up" | "adjustment";
			category: string;
			description: string;
			amount: number;
			created_at: number;
		}>();

	return c.json({ data: res.results || [] });
});

/** Auto-select candle interval based on time range. */
function resolveIntervalMs(hours: number): number {
	if (hours <= 6) return 120_000;
	if (hours <= 24) return 600_000;
	if (hours <= 72) return 1_800_000;
	return 3_600_000;
}

/** Price candle data for charts */
systemRouter.get("/candles/:dimension/:value", async (c) => {
	const dimension = c.req.param("dimension");
	const validDimensions = new Set(["model:input", "model:output", "provider"]);
	if (!validDimensions.has(dimension)) {
		return c.json(
			{
				error: { message: "Invalid dimension", type: "invalid_request_error" },
			},
			400,
		);
	}
	const value = decodeURIComponent(c.req.param("value"));
	const hours = Math.min(Number(c.req.query("hours")) || 24, 168);
	const since = Date.now() - hours * 60 * 60 * 1000;
	const intervalMs = resolveIntervalMs(hours);

	const dao = new CandleDao(c.env.DB);
	const candles = await dao.getCandles(
		dimension as CandleDimension,
		value,
		since,
		intervalMs,
	);

	return c.json({
		data: candles.map((cd) => ({
			time: cd.interval_start,
			open: cd.open_price,
			high: cd.high_price,
			low: cd.low_price,
			close: cd.close_price,
		})),
	});
});

export default systemRouter;

import { Hono } from "hono";
import { CandleDao, type CandleDimension } from "../core/db/candle-dao";
import { CredentialsDao } from "../core/db/credentials-dao";
import { LogsDao } from "../core/db/logs-dao";
import { getAllProviders } from "../core/providers/registry";
import { edgeCache } from "../shared/cache";
import type { AppEnv } from "../shared/types";

const systemRouter = new Hono<AppEnv>();

systemRouter.get("/me", (c) => {
	const ownerId = c.get("owner_id");
	const isAdmin =
		!!c.env.PLATFORM_OWNER_ID && ownerId === c.env.PLATFORM_OWNER_ID;
	return c.json({ ownerId, isAdmin });
});

systemRouter.get("/pool/stats", async (c) => {
	const userId = c.get("owner_id");
	const [credStats, logStats] = await Promise.all([
		new CredentialsDao(c.env.DB).getStats(userId),
		new LogsDao(c.env.DB).get24hStats(userId),
	]);
	return c.json({
		healthyCredentials: credStats.total - credStats.dead,
		earnings24h: logStats.earnings,
		apiCalls24h: logStats.apiCalls,
	});
});

systemRouter.get("/providers", edgeCache(), (c) => {
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

/** API request logs (per-request detail) */
systemRouter.get("/logs", async (c) => {
	const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
	const userId = c.get("owner_id");
	const dao = new LogsDao(c.env.DB);
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

/** Auto-select candle interval based on time range. */
function resolveIntervalMs(hours: number): number {
	if (hours <= 6) return 120_000;
	if (hours <= 24) return 600_000;
	if (hours <= 72) return 1_800_000;
	return 3_600_000;
}

/** Bulk 24h sparkline data for all items in a dimension */
systemRouter.get("/sparklines/:dimension", edgeCache(), async (c) => {
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
	const dao = new CandleDao(c.env.DB);
	const data = await dao.getSparklines(dimension as CandleDimension);
	return c.json({ data });
});

/** Price candle data for charts */
systemRouter.get("/candles/:dimension/:value", edgeCache(), async (c) => {
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

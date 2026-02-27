import { Hono } from "hono";
import { CandleDao } from "../../core/db/candle-dao";
import { syncAllModels, syncAutoCredits } from "../../core/sync/sync-service";
import { BadRequestError } from "../../shared/errors";
import type { AppEnv } from "../../shared/types";
import { AdminDao } from "../billing/admin-dao";

const admin = new Hono<AppEnv>();

admin.use("*", async (c, next) => {
	const ownerId = c.get("owner_id");
	const platformOwnerId = c.env.PLATFORM_OWNER_ID;
	if (!platformOwnerId || ownerId !== platformOwnerId) {
		return c.json(
			{ error: { message: "Forbidden", type: "authorization_error" } },
			403,
		);
	}
	return next();
});

admin.get("/overview", async (c) => {
	const dao = new AdminDao(c.env.DB);
	return c.json({ data: await dao.getOverview() });
});

admin.get("/users", async (c) => {
	const dao = new AdminDao(c.env.DB);
	return c.json({ data: await dao.getUsers() });
});

admin.post("/credits", async (c) => {
	const { ownerId, amount, reason } = await c.req.json<{
		ownerId: string;
		amount: number;
		reason?: string;
	}>();

	if (!ownerId || typeof amount !== "number" || amount === 0) {
		throw new BadRequestError("ownerId and a non-zero amount are required");
	}

	await new AdminDao(c.env.DB).adjustCredits(ownerId, amount, reason || "");
	return c.json({ success: true });
});

admin.get("/adjustments", async (c) => {
	const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
	const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
	const result = await new AdminDao(c.env.DB).getAdjustments(limit, offset);
	return c.json({ rows: result.rows, total: result.total });
});

admin.get("/table/:name", async (c) => {
	const table = c.req.param("name");
	const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
	const offset = Math.max(Number(c.req.query("offset")) || 0, 0);

	try {
		const result = await new AdminDao(c.env.DB).queryTable(
			table,
			limit,
			offset,
		);
		return c.json({ rows: result.rows, total: result.total });
	} catch (err) {
		throw new BadRequestError(
			err instanceof Error ? err.message : "Invalid table",
		);
	}
});

// ─── Manual cron triggers ───────────────────────────────

admin.post("/sync-models", async (c) => {
	const rate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
	const start = Date.now();
	await syncAllModels(c.env.DB, rate);
	await syncAutoCredits(c.env.DB, rate);
	await new CandleDao(c.env.DB).pruneOldCandles();
	return c.json({ message: "Models synced", elapsed: Date.now() - start });
});

admin.post("/sync-candles", async (c) => {
	const dao = new CandleDao(c.env.DB);
	const start = Date.now();
	await dao.aggregate(Date.now() - 60_000);
	await dao.generateQuotedCandles();
	return c.json({ message: "Candles aggregated", elapsed: Date.now() - start });
});

export default admin;

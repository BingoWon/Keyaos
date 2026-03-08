import { Hono } from "hono";
import { CandleDao } from "../../core/db/candle-dao";
import { syncAllModels, syncAutoCredits } from "../../core/sync/sync-service";
import { briefHint, decrypt, mask } from "../../shared/crypto";
import { BadRequestError } from "../../shared/errors";
import type { AppEnv } from "../../shared/types";
import { AdminDao } from "../billing/admin-dao";
import { GiftCardDao } from "../billing/gift-card-dao";

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

admin.get("/activity", async (c) => {
	const hours = Math.min(Number(c.req.query("hours")) || 24, 168);
	const data = await new AdminDao(c.env.DB).getActivity(hours);
	return c.json({ data });
});

// ─── Gift cards ──────────────────────────────────────────

admin.post("/gift-cards", async (c) => {
	const { amount, count, expiresAt } = await c.req.json<{
		amount: number;
		count: number;
		expiresAt?: number;
	}>();

	if (!amount || amount <= 0) throw new BadRequestError("amount must be > 0");
	if (!count || !Number.isInteger(count) || count < 1 || count > 500) {
		throw new BadRequestError("count must be 1–500");
	}

	const dao = new GiftCardDao(c.env.DB);
	const result = await dao.createBatch(
		c.get("owner_id"),
		amount,
		count,
		expiresAt,
	);
	return c.json(result);
});

admin.get("/gift-cards", async (c) => {
	const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
	const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
	const cards = await new GiftCardDao(c.env.DB).listAll(limit, offset);
	return c.json(cards);
});

admin.get("/gift-cards/:batchId", async (c) => {
	const cards = await new GiftCardDao(c.env.DB).listBatch(
		c.req.param("batchId"),
	);
	return c.json({ data: cards });
});

// ─── One-off maintenance ─────────────────────────────────

admin.post("/remask", async (c) => {
	const ek = c.env.ENCRYPTION_KEY;
	const db = c.env.DB;
	let updated = 0;

	const keys = await db
		.prepare("SELECT id, encrypted_key FROM api_keys")
		.all<{ id: string; encrypted_key: string }>();
	for (const row of keys.results ?? []) {
		const plain = await decrypt(row.encrypted_key, ek);
		const hint = mask(plain, 10, 4);
		await db
			.prepare("UPDATE api_keys SET key_hint = ? WHERE id = ?")
			.bind(hint, row.id)
			.run();
		updated++;
	}

	const creds = await db
		.prepare("SELECT id, encrypted_secret FROM upstream_credentials")
		.all<{ id: string; encrypted_secret: string }>();
	for (const row of creds.results ?? []) {
		const plain = await decrypt(row.encrypted_secret, ek);
		const hint = briefHint(plain);
		await db
			.prepare("UPDATE upstream_credentials SET secret_hint = ? WHERE id = ?")
			.bind(hint, row.id)
			.run();
		updated++;
	}

	return c.json({ message: "Hints re-masked", updated });
});

// ─── Manual cron triggers ───────────────────────────────

admin.post("/sync-models", async (c) => {
	const rate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
	const start = Date.now();
	await syncAllModels(c.env.DB, rate);
	await syncAutoCredits(c.env.DB, c.env.ENCRYPTION_KEY, rate);
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

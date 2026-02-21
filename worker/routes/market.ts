/**
 * Models route — serves from local D1 cache (refreshed by Cron)
 */
import { Hono } from "hono";
import { MarketDao } from "../core/db/market-dao";
import type { Env } from "../index";

const marketRouter = new Hono<{ Bindings: Env }>();

marketRouter.get("/", async (c) => {
	const dao = new MarketDao(c.env.DB);
	const all = await dao.getActiveQuotes();

	// Deduplicate by upstream_id, keeping the cheapest offering
	const seen = new Map<string, (typeof all)[0]>();
	for (const m of all) {
		if (!seen.has(m.upstream_id)) {
			seen.set(m.upstream_id, m);
		}
	}

	const data = [...seen.values()].map((m) => ({
		id: m.upstream_id,
		object: "model" as const,
		created: Math.floor(m.refreshed_at / 1000),
		owned_by: m.provider,
		...(m.display_name && { name: m.display_name }),
		// Custom UI fields
		input_price: m.input_price,
		output_price: m.output_price,
		context_length: m.context_length,
	}));

	return c.json({ object: "list", data });
});

export default marketRouter;

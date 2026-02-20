/**
 * Models route — serves from local D1 cache (synced by Cron)
 */
import { Hono } from "hono";
import { ModelsDao } from "../core/db/models-dao";
import type { Env } from "../index";

const modelsRouter = new Hono<{ Bindings: Env }>();

modelsRouter.get("/", async (c) => {
	const dao = new ModelsDao(c.env.DB);
	const all = await dao.getActiveModels();

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
		created: Math.floor(m.synced_at / 1000),
		owned_by: m.provider,
		...(m.display_name && { name: m.display_name }),
	}));

	return c.json({ object: "list", data });
});

export default modelsRouter;

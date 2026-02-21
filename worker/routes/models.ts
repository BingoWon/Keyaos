import { Hono } from "hono";
import { PricingDao } from "../core/db/pricing-dao";
import { syncAllModels, syncAutoCredits } from "../core/sync/sync-service";
import type { AppEnv } from "../shared/types";

const modelsRouter = new Hono<AppEnv>();

modelsRouter.get("/", async (c) => {
	const dao = new PricingDao(c.env.DB);
	const all = await dao.getActivePricing();

	const data = all.map((m) => ({
		id: m.model_id,
		object: "model" as const,
		created: Math.floor(m.refreshed_at / 1000),
		owned_by: m.provider,
		...(m.name && { name: m.name }),
		input_price: m.input_price,
		output_price: m.output_price,
		context_length: m.context_length,
	}));

	return c.json({ object: "list", data });
});

modelsRouter.post("/sync", async (c) => {
	const rate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
	await syncAllModels(c.env.DB, rate);
	await syncAutoCredits(c.env.DB, rate);
	return c.json({ message: "Sync completed" });
});

export default modelsRouter;

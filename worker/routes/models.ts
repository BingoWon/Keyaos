import { Hono } from "hono";
import { PricingDao } from "../core/db/pricing-dao";
import { syncAllModels, syncAutoCredits } from "../core/sync/sync-service";
import type { AppEnv } from "../shared/types";

const modelsRouter = new Hono<AppEnv>();

modelsRouter.get("/", async (c) => {
	const dao = new PricingDao(c.env.DB);
	const all = await dao.getActivePricingWithBestMultiplier();

	const data = all.map((m) => {
		const entry: Record<string, unknown> = {
			id: m.model_id,
			object: "model" as const,
			created: Math.floor(m.refreshed_at / 1000),
			owned_by: m.provider,
			...(m.name && { name: m.name }),
			input_price: m.input_price,
			output_price: m.output_price,
			context_length: m.context_length,
		};

		if (m.best_multiplier != null && m.best_multiplier < 1) {
			entry.platform_input_price = m.input_price * m.best_multiplier;
			entry.platform_output_price = m.output_price * m.best_multiplier;
		}

		return entry;
	});

	return c.json({ object: "list", data });
});

modelsRouter.post("/sync", async (c) => {
	const ownerId = c.get("owner_id");
	const platformOwnerId = c.env.PLATFORM_OWNER_ID;
	if (platformOwnerId && ownerId !== platformOwnerId) {
		return c.json(
			{ error: { message: "Forbidden", type: "authorization_error" } },
			403,
		);
	}

	const rate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
	await syncAllModels(c.env.DB, rate);
	await syncAutoCredits(c.env.DB, rate);
	return c.json({ message: "Sync completed" });
});

export default modelsRouter;

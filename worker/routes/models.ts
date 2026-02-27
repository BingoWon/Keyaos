import { Hono } from "hono";
import { PricingDao } from "../core/db/pricing-dao";
import type { AppEnv } from "../shared/types";

const modelsRouter = new Hono<AppEnv>();

modelsRouter.get("/", async (c) => {
	const dao = new PricingDao(c.env.DB);
	const all = await dao.getActivePricingWithBestMultiplier();

	const data = all.map((m) => {
		const mul = m.best_multiplier;
		return {
			id: m.model_id,
			object: "model" as const,
			created: Math.floor(m.refreshed_at / 1000),
			owned_by: m.provider,
			...(m.name && { name: m.name }),
			input_price: m.input_price,
			output_price: m.output_price,
			...(mul != null &&
				mul < 1 && {
				platform_input_price: m.input_price * mul,
				platform_output_price: m.output_price * mul,
			}),
			context_length: m.context_length,
			input_modalities: m.input_modalities ? JSON.parse(m.input_modalities) : null,
			output_modalities: m.output_modalities ? JSON.parse(m.output_modalities) : null,
		};
	});

	return c.json({ object: "list", data });
});

export default modelsRouter;


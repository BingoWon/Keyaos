import { Hono } from "hono";
import { KeyPoolService } from "../core/key-pool";
import { getAllProviders } from "../core/providers/registry";
import type { Env } from "../index";

const systemRouter = new Hono<{ Bindings: Env }>();

systemRouter.get("/pool/stats", async (c) => {
	const keyPool = new KeyPoolService(c.env.DB);
	return c.json(await keyPool.getStats());
});

systemRouter.get("/providers", (c) => {
	const providers = getAllProviders().map((p) => ({
		id: p.info.id,
		name: p.info.name,
		openaiCompatible: p.info.openaiCompatible,
	}));
	return c.json({ data: providers });
});

export default systemRouter;

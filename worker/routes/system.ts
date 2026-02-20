import { Hono } from "hono";
import { KeysDao } from "../core/db/keys-dao";
import { getAllProviders } from "../core/providers/registry";
import type { Env } from "../index";

const systemRouter = new Hono<{ Bindings: Env }>();

systemRouter.get("/pool/stats", async (c) => {
	const keysDao = new KeysDao(c.env.DB);
	return c.json(await keysDao.getStats());
});

systemRouter.get("/providers", (c) => {
	const providers = getAllProviders().map((p) => ({
		id: p.info.id,
		name: p.info.name,
	}));
	return c.json({ data: providers });
});

export default systemRouter;

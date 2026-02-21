/**
 * System routes — stats, providers, ledger
 */
import { Hono } from "hono";
import { LedgerDao } from "../core/db/ledger-dao";
import { ListingsDao } from "../core/db/listings-dao";
import { getAllProviders } from "../core/providers/registry";
import type { Env } from "../index";

const systemRouter = new Hono<{ Bindings: Env }>();

systemRouter.get("/pool/stats", async (c) => {
	const listingsDao = new ListingsDao(c.env.DB);
	return c.json(await listingsDao.getStats());
});

systemRouter.get("/providers", (c) => {
	const providers = getAllProviders().map((p) => ({
		id: p.info.id,
		name: p.info.name,
		supportsAutoCredits: p.info.supportsAutoCredits,
	}));
	return c.json({ data: providers });
});

systemRouter.get("/ledger", async (c) => {
	const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
	const dao = new LedgerDao(c.env.DB);
	const ledger = await dao.getRecentEntries(limit);
	return c.json({
		data: ledger.map((tx) => ({
			id: tx.id,
			listingId: tx.listing_id,
			provider: tx.provider,
			model: tx.model,
			inputTokens: tx.input_tokens,
			outputTokens: tx.output_tokens,
			costCents: tx.cost_cents,
			createdAt: tx.created_at,
		})),
	});
});

export default systemRouter;

/**
 * System routes — stats, providers, ledger
 */
import { Hono } from "hono";
import { LedgerDao } from "../core/db/ledger-dao";
import { QuotasDao } from "../core/db/quotas-dao";
import { getAllProviders } from "../core/providers/registry";
import type { Env } from "../index";

const systemRouter = new Hono<{ Bindings: Env; Variables: { owner_id: string } }>();

systemRouter.get("/pool/stats", async (c) => {
	const quotasDao = new QuotasDao(c.env.DB);
	const owner_id = c.get("owner_id");
	return c.json(await quotasDao.getStats(owner_id));
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
	const owner_id = c.get("owner_id");
	const ledger = await dao.getRecentEntries(owner_id, limit);
	return c.json({
		data: ledger.map((tx) => ({
			id: tx.id,
			listingId: tx.listing_id,
			provider: tx.provider,
			model: tx.model,
			inputTokens: tx.input_tokens,
			outputTokens: tx.output_tokens,
			creditsUsed: tx.credits_used,
			createdAt: tx.created_at,
		})),
	});
});

export default systemRouter;

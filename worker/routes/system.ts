import { Hono } from "hono";
import { CredentialsDao } from "../core/db/credentials-dao";
import { LedgerDao } from "../core/db/ledger-dao";
import { getAllProviders } from "../core/providers/registry";
import type { AppEnv } from "../shared/types";

const systemRouter = new Hono<AppEnv>();

systemRouter.get("/pool/stats", async (c) => {
	const dao = new CredentialsDao(c.env.DB);
	return c.json(await dao.getStats(c.get("owner_id")));
});

systemRouter.get("/providers", (c) => {
	const providers = getAllProviders().map((p) => ({
		id: p.info.id,
		name: p.info.name,
		logoUrl: p.info.logoUrl,
		supportsAutoCredits: p.info.supportsAutoCredits,
		authType: p.info.authType ?? "api_key",
	}));
	return c.json({ data: providers });
});

systemRouter.get("/ledger", async (c) => {
	const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
	const dao = new LedgerDao(c.env.DB);
	const ledger = await dao.getRecentEntries(c.get("owner_id"), limit);
	return c.json({
		data: ledger.map((tx) => ({
			id: tx.id,
			credentialId: tx.credential_id,
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

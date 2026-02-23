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
		isSubscription: p.info.isSubscription ?? false,
		credentialGuide: p.info.credentialGuide ?? null,
	}));
	return c.json({ data: providers });
});

systemRouter.get("/ledger", async (c) => {
	const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
	const userId = c.get("owner_id");
	const dao = new LedgerDao(c.env.DB);
	const entries = await dao.getEntriesForUser(userId, limit);

	return c.json({
		data: entries.map((tx) => {
			const isConsumer = tx.consumer_id === userId;
			const isProvider = tx.credential_owner_id === userId;

			let direction: "spent" | "earned" | "self";
			if (isConsumer && isProvider) direction = "self";
			else if (isConsumer) direction = "spent";
			else direction = "earned";

			const netCredits =
				direction === "spent"
					? -tx.consumer_charged
					: direction === "earned"
						? tx.provider_earned
						: 0;

			return {
				id: tx.id,
				direction,
				credentialId: tx.credential_id,
				provider: tx.provider,
				model: tx.model,
				inputTokens: tx.input_tokens,
				outputTokens: tx.output_tokens,
				baseCost: tx.base_cost,
				consumerCharged: tx.consumer_charged,
				providerEarned: tx.provider_earned,
				platformFee: tx.platform_fee,
				netCredits,
				createdAt: tx.created_at,
			};
		}),
	});
});

export default systemRouter;

import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiKeysDao } from "./core/db/api-keys-dao";
import { CandleDao } from "./core/db/candle-dao";
import { syncAllModels, syncAutoCredits } from "./core/sync/sync-service";
import adminRouter from "./platform/routes/admin";
import billingRouter, { webhookRouter } from "./platform/routes/billing";
import apiKeysRouter from "./routes/api-keys";
import chatRouter from "./routes/chat";
import credentialsRouter from "./routes/credentials";
import messagesRouter from "./routes/messages";
import modelsRouter from "./routes/models";
import systemRouter from "./routes/system";
import { ApiError, AuthenticationError } from "./shared/errors";
import { log } from "./shared/logger";
import type { AppEnv, Env } from "./shared/types";

const CORE_OWNER = "self";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
	if (err instanceof ApiError) {
		return c.json(err.toJSON(), err.statusCode as ContentfulStatusCode);
	}
	log.error("unhandled", err instanceof Error ? err.message : String(err), {
		stack: err instanceof Error ? err.stack : undefined,
	});
	return c.json(
		{ error: { message: "Internal server error", type: "server_error" } },
		500,
	);
});

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"x-api-key",
			"anthropic-version",
		],
		exposeHeaders: ["x-request-id", "x-provider", "x-credential-id"],
	}),
);

app.get("/health", (c) => c.json({ status: "ok" }));

// ─── Auth: Management API (/api/*) ─────────────────────
app.use("/api/*", async (c, next) => {
	if (c.req.path.startsWith("/api/webhooks/")) return next();

	if (c.env.CLERK_SECRET_KEY) {
		await clerkMiddleware()(c, async () => {});
		const auth = getAuth(c);
		if (auth?.userId) {
			c.set("owner_id", auth.userId);
			return next();
		}
		throw new AuthenticationError("Invalid or missing Clerk session");
	}

	const token = c.req
		.header("Authorization")
		?.replace(/^Bearer\s+/i, "")
		.trim();
	if (!token || token !== c.env.ADMIN_TOKEN) {
		throw new AuthenticationError("Invalid or missing admin token");
	}
	c.set("owner_id", CORE_OWNER);
	return next();
});

// ─── Auth: Downstream API (/v1/*) ──────────────────────
app.use("/v1/*", async (c, next) => {
	const token =
		c.req
			.header("Authorization")
			?.replace(/^Bearer\s+/i, "")
			.trim() || c.req.header("x-api-key")?.trim();
	if (!token) throw new AuthenticationError("Missing authorization token");

	const key = await new ApiKeysDao(c.env.DB).getKey(token);
	if (key?.is_enabled === 1) {
		c.set("owner_id", key.owner_id);
		return next();
	}

	if (c.env.CLERK_SECRET_KEY) {
		try {
			await clerkMiddleware()(c, async () => {});
			const auth = getAuth(c);
			if (auth?.userId) {
				c.set("owner_id", auth.userId);
				return next();
			}
		} catch {
			// Not a valid Clerk JWT — fall through
		}
	}

	if (token === c.env.ADMIN_TOKEN) {
		c.set("owner_id", CORE_OWNER);
		return next();
	}

	throw new AuthenticationError("Invalid or inactive authentication");
});

// ─── Management API ─────────────────────────────────────
app.route("/api/credentials", credentialsRouter);
app.route("/api/api-keys", apiKeysRouter);
app.route("/api/models", modelsRouter);
app.route("/api", systemRouter);

// ─── Platform-only routes (gated at request time) ───────
const platformNotFound = (c: Context) =>
	c.json(
		{ error: { message: "Not Found", type: "invalid_request_error" } },
		404,
	);

app.use("/api/billing/*", async (c, next) =>
	c.env.CLERK_SECRET_KEY ? next() : platformNotFound(c),
);
app.route("/api/billing", billingRouter);

app.use("/api/admin/*", async (c, next) =>
	c.env.PLATFORM_OWNER_ID ? next() : platformNotFound(c),
);
app.route("/api/admin", adminRouter);

app.use("/api/webhooks/*", async (c, next) =>
	c.env.STRIPE_WEBHOOK_SECRET ? next() : platformNotFound(c),
);
app.route("/api/webhooks", webhookRouter);

// ─── OpenAI-compatible API ──────────────────────────────
app.route("/v1/chat", chatRouter);
app.route("/v1/models", modelsRouter);

// ─── Anthropic-compatible API ───────────────────────────
app.route("/v1/messages", messagesRouter);

// ─── SPA Fallback ───────────────────────────────────────
app.notFound(async (c) => {
	if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/v1/")) {
		return c.json(
			{ error: { message: "Not Found", type: "invalid_request_error" } },
			404,
		);
	}
	if (c.env.ASSETS) {
		try {
			const res = await c.env.ASSETS.fetch(c.req.raw);
			if (res.status === 404) {
				const url = new URL(c.req.url);
				url.pathname = "/";
				return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
			}
			return res;
		} catch {
			// Ignore ASSETS errors
		}
	}
	return c.text("Not Found", 404);
});

export default {
	fetch: app.fetch,

	async scheduled(
		_event: ScheduledEvent,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		const rate = Number.parseFloat(env.CNY_USD_RATE || "7");
		const intervalMs = 5 * 60 * 1000;
		const candleDao = new CandleDao(env.DB);
		ctx.waitUntil(
			Promise.all([
				syncAllModels(env.DB, rate),
				syncAutoCredits(env.DB, rate),
				candleDao.aggregate(Date.now() - intervalMs),
				candleDao.pruneOldCandles(),
			]),
		);
	},
};

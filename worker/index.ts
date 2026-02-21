import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ApiKeysDao } from "./core/db/api-keys-dao";
import { configureProviders } from "./core/providers/registry";
import {
	refreshAllModels,
	refreshAutoCredits,
} from "./core/refresh/refresh-service";
import apiKeysRouter from "./routes/api-keys";
import chatRouter from "./routes/chat";
import credentialsRouter from "./routes/credentials";
import marketRouter from "./routes/market";
import systemRouter from "./routes/system";
import { ApiError, AuthenticationError } from "./shared/errors";
import type { AppEnv, Env } from "./shared/types";

const CORE_OWNER = "self";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
	if (err instanceof ApiError) {
		return c.json(err.toJSON(), err.statusCode as 400);
	}
	console.error("[UNHANDLED]", err);
	return c.json(
		{ error: { message: "Internal server error", type: "server_error" } },
		500,
	);
});

app.use("*", (c, next) => {
	configureProviders(c.env);
	return next();
});

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);

app.get("/health", (c) => c.json({ status: "ok" }));

// ─── Auth: Management API (/api/*) ─────────────────────
app.use("/api/*", async (c, next) => {
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
	const token = c.req
		.header("Authorization")
		?.replace(/^Bearer\s+/i, "")
		.trim();
	if (!token) throw new AuthenticationError("Missing authorization token");

	const key = await new ApiKeysDao(c.env.DB).getKey(token);
	if (key?.is_active === 1) {
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
app.route("/api/market", marketRouter);
app.route("/api", systemRouter);
app.post("/api/refresh", async (c) => {
	const rate = Number.parseFloat(c.env.CNY_USD_RATE || "7");
	await refreshAllModels(c.env.DB, rate);
	await refreshAutoCredits(c.env.DB, rate);
	return c.json({ message: "Refresh completed" });
});

// ─── OpenAI-compatible API ──────────────────────────────
app.route("/v1/chat", chatRouter);
app.route("/v1/models", marketRouter);

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
		ctx.waitUntil(
			Promise.all([
				refreshAllModels(env.DB, rate),
				refreshAutoCredits(env.DB, rate),
			]),
		);
	},
};

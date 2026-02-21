import { Hono } from "hono";
import { cors } from "hono/cors";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { ApiKeysDao } from "./core/db/api-keys-dao";
import {
	refreshAllModels,
	refreshAutoCredits,
} from "./core/refresh/refresh-service";
import apiKeysRouter from "./routes/api-keys";
import chatRouter from "./routes/chat";
import quotasRouter from "./routes/quotas";
import marketRouter from "./routes/market";
import systemRouter from "./routes/system";
import { ApiError, AuthenticationError } from "./shared/errors";

export type Env = {
	DB: D1Database;
	CLERK_PUBLISHABLE_KEY: string;
	CLERK_SECRET_KEY: string;
	CNY_USD_RATE?: string;
	ASSETS?: Fetcher;
};

const app = new Hono<{
	Bindings: Env;
	Variables: { owner_id: string };
}>();

// Global error handler
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

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);

// Public
app.get("/health", (c) => c.json({ status: "ok" }));

// Auth middleware for Management API (Admin only)
app.use("/api/*", clerkMiddleware(), async (c, next) => {
	const auth = getAuth(c);
	if (!auth?.userId) {
		throw new AuthenticationError("Unauthorized: Missing or invalid Clerk authentication");
	}
	c.set("owner_id", auth.userId);
	return next();
});

// Auth middleware for Downstream API (Dashboard UI OR downstream API Keys)
app.use("/v1/*", clerkMiddleware(), async (c, next) => {
	const token = c.req
		.header("Authorization")
		?.replace(/^Bearer\s+/i, "")
		.trim();
	if (!token) {
		throw new AuthenticationError("Invalid or missing token");
	}

	// 1. Check if it's a valid Clerk UI JWT Session
	const auth = getAuth(c);
	if (auth?.userId) {
		c.set("owner_id", auth.userId);
		return next();
	}

	// 2. Fallback to Database API Key validation (for scripts/downstream apps)
	const dao = new ApiKeysDao(c.env.DB);
	const key = await dao.getKey(token);
	if (!key || key.is_active !== 1) {
		throw new AuthenticationError("Invalid or inactive API key");
	}

	c.set("owner_id", key.owner_id);
	return next();
});

// Management API
app.route("/api/quotas", quotasRouter);
app.route("/api/api-keys", apiKeysRouter);
app.route("/api/market", marketRouter);
app.route("/api", systemRouter);
app.post("/api/refresh", async (c) => {
	const rate = parseFloat(c.env.CNY_USD_RATE || "7");
	await refreshAllModels(c.env.DB, rate);
	await refreshAutoCredits(c.env.DB, rate);
	return c.json({ message: "Refresh completed" });
});

// OpenAI-compatible API
app.route("/v1/chat", chatRouter);
app.route("/v1/models", marketRouter); // Note: keep external interface as /v1/models for openai compatibility

// SPA Fallback for React Router (serves index.html for unmatched routes)
app.notFound(async (c) => {
	// If it's an API request that doesn't exist, return JSON 404
	if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/v1/")) {
		return c.json(
			{ error: { message: "Not Found", type: "invalid_request_error" } },
			404,
		);
	}

	// For frontend routes, attempt to fetch the original asset
	if (c.env.ASSETS) {
		try {
			const res = await c.env.ASSETS.fetch(c.req.raw);
			// If asset not found (e.g. hitting /listings directly), fallback to index.html
			if (res.status === 404) {
				const url = new URL(c.req.url);
				url.pathname = "/";
				return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
			}
			return res;
		} catch (e) {
			// Ignore ASSETS errors in case it's misconfigured
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
		const rate = parseFloat(env.CNY_USD_RATE || "7");
		ctx.waitUntil(
			Promise.all([
				refreshAllModels(env.DB, rate),
				refreshAutoCredits(env.DB, rate),
			]),
		);
	},
};

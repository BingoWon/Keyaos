import { Hono } from "hono";
import { cors } from "hono/cors";
import { syncAllProviders } from "./core/sync/sync-service";
import chatRouter from "./routes/chat";
import keysRouter from "./routes/keys";
import modelsRouter from "./routes/models";
import systemRouter from "./routes/system";
import { AuthenticationError } from "./shared/errors";

export type Env = {
	MODE: "personal" | "platform";
	ADMIN_EMAILS: string;
	ADMIN_TOKEN: string;
	DB: D1Database;
};

const app = new Hono<{ Bindings: Env }>();

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok", mode: c.env.MODE }));

// ─── Middleware: Admin Auth Guard ──────────────────────────────
app.use("*", async (c, next) => {
	const path = new URL(c.req.url).pathname;

	// Public routes
	if (
		path === "/health" ||
		path.startsWith("/providers") ||
		path.startsWith("/v1/")
	) {
		return next();
	}

	// Admin routes: require Bearer token
	const authHeader = c.req.header("Authorization");
	const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
	const validToken = c.env.ADMIN_TOKEN || "admin";

	if (!token || token !== validToken) {
		throw new AuthenticationError("Admin access denied");
	}

	return next();
});

// ─── Mount Routers ──────────────────────────────────────────────
app.route("/v1/chat", chatRouter);
app.route("/v1/models", modelsRouter);
app.route("/keys", keysRouter);
app.route("/", systemRouter);

export default {
	fetch: app.fetch,

	async scheduled(
		_event: ScheduledEvent,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		ctx.waitUntil(syncAllProviders(env.DB));
	},
};

import { Hono } from "hono";
import { cors } from "hono/cors";
import { syncAllProviders } from "./core/sync/sync-service";
import chatRouter from "./routes/chat";
import keysRouter from "./routes/keys";
import modelsRouter from "./routes/models";
import systemRouter from "./routes/system";
import { ApiError, AuthenticationError } from "./shared/errors";

export type Env = {
	DB: D1Database;
	ADMIN_TOKEN: string;
};

const app = new Hono<{ Bindings: Env }>();

// Global error handler — all ApiErrors return JSON
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

app.get("/health", (c) => c.json({ status: "ok" }));

// Auth middleware
app.use("*", async (c, next) => {
	if (new URL(c.req.url).pathname === "/health") return next();

	const authHeader = c.req.header("Authorization");
	const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

	if (!token || token !== c.env.ADMIN_TOKEN) {
		throw new AuthenticationError("Invalid or missing token");
	}

	return next();
});

app.route("/v1/chat", chatRouter);
app.route("/v1/models", modelsRouter);
app.route("/keys", keysRouter);
app.route("/", systemRouter);

app.post("/sync", async (c) => {
	await syncAllProviders(c.env.DB);
	return c.json({ message: "Sync completed" });
});

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

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createCoreRoutes } from "./core/gateway";

export type Env = {
	MODE: "personal" | "platform";
	ADMIN_EMAILS: string;
	ADMIN_TOKEN: string;
	// D1 DB bindings, KV, etc. will go here later
};

const app = new Hono<{ Bindings: Env }>();

// Global CORS (important for API access if ever split from the frontend)
app.use(
	"*",
	cors({
		origin: "*", // For MVP, allow all. In production, restrict this.
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok", mode: c.env.MODE }));

// Mount core routes
createCoreRoutes(app);

// The fallback for frontend assets will be handled by Vite/Cloudflare Pages
// in production. For dev, Vite handles it.
export default app;

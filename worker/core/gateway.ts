/**
 * Core API Gateway
 *
 * Mounts all API routes onto the Hono app.
 * Routes:
 * - POST /v1/chat/completions — proxy to upstream
 * - GET  /v1/models           — list available models
 * - POST /keys                — add a key to the pool (personal mode)
 * - GET  /keys                — list keys in the pool
 * - DELETE /keys/:id          — remove a key
 * - GET  /keys/:id/balance    — check key balance
 * - GET  /pool/stats          — pool statistics
 */

import type { Hono } from "hono";
import type { Env } from "../index";
import { ApiError, AuthenticationError, BadRequestError } from "../shared/errors";
import { dispatch } from "./dispatcher";
import { KeyPoolService } from "./key-pool";
import {
	getAllProviders,
	getProvider,
	getProviderIds,
} from "./providers/registry";
import { KeysDao } from "./db/keys-dao"; // For direct getKey access

export function createCoreRoutes(app: Hono<{ Bindings: Env }>) {
	// ─── Middleware: Admin Auth Guard ──────────────────────────────
	app.use("*", async (c, next) => {
		const path = new URL(c.req.url).pathname;

		// Public routes: health, and all /v1/ OpenAI-compatible endpoints
		if (path === "/health" || path.startsWith("/v1/")) {
			return next();
		}

		// Admin routes: require Bearer token matching ADMIN_TOKEN
		const authHeader = c.req.header("Authorization");
		const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
		const validToken = c.env.ADMIN_TOKEN || "admin";

		if (!token || token !== validToken) {
			throw new AuthenticationError("Admin access denied");
		}

		return next();
	});

	// ─── Chat Completions (main endpoint) ──────────────────────────

	app.post("/v1/chat/completions", async (c) => {
		const keyPool = new KeyPoolService(c.env.DB);
		let body: Record<string, unknown>;
		try {
			body = await c.req.json();
		} catch {
			throw new BadRequestError("Invalid JSON body");
		}

		const model = body.model as string;
		if (!model) {
			throw new BadRequestError("model is required");
		}

		// Dispatch: select provider + key
		const { key, provider, upstreamModel } = await dispatch(c.env.DB, model);

		// Override model in body to the upstream model name
		const upstreamBody = { ...body, model: upstreamModel };

		try {
			// Forward request
			const response = await provider.forwardRequest(
				key.api_key_encrypted, // NOTE: this should be decrypted in Phase 3
				c.req.raw,
				upstreamBody,
			);

			// Report success
			await keyPool.reportSuccess(key.id);

			// Transparent proxy: return upstream response as-is
			return response;
		} catch (err) {
			// Report failure
			const statusCode = err instanceof ApiError ? err.statusCode : 500;
			await keyPool.reportFailure(key.id, statusCode);
			throw err;
		}
	});

	// ─── Models listing ────────────────────────────────────────────

	app.get("/v1/models", async (c) => {
		const keyPool = new KeyPoolService(c.env.DB);
		const allModels: unknown[] = [];
		const seenProviders = new Set<string>();

		const allKeys = await keyPool.getAllKeys();
		for (const key of allKeys) {
			if (key.is_active !== 1 || key.health_status === "dead") continue;
			if (seenProviders.has(key.provider)) continue;
			seenProviders.add(key.provider);

			const provider = getProvider(key.provider);
			if (!provider) continue;

			try {
				const result = (await provider.listModels(key.api_key_encrypted)) as {
					data?: unknown[];
				};
				if (result?.data) {
					allModels.push(...result.data);
				}
			} catch {
				console.error(`Failed to list models from ${key.provider}`);
			}
		}

		return c.json({ object: "list", data: allModels });
	});

	// ─── Key Management ────────────────────────────────────────────

	app.post("/keys", async (c) => {
		const keyPool = new KeyPoolService(c.env.DB);
		let body: { provider: string; apiKey: string; models?: string[] };
		try {
			body = await c.req.json();
		} catch {
			throw new BadRequestError("Invalid JSON body");
		}

		if (!body.provider || !body.apiKey) {
			throw new BadRequestError("provider and apiKey are required");
		}

		const providerIds = getProviderIds();
		if (!providerIds.includes(body.provider)) {
			throw new BadRequestError(
				`Unknown provider: ${body.provider}. Supported: ${providerIds.join(", ")}`,
			);
		}

		const provider = getProvider(body.provider)!;
		const isValid = await provider.validateKey(body.apiKey);
		if (!isValid) {
			throw new BadRequestError(
				`Invalid API key for ${body.provider}. The key was rejected by the provider.`,
			);
		}

		// Hardcoded Platform Owner ID for MVP
		const adminOwnerId = "user_1";
		const key = await keyPool.addKey(adminOwnerId, body.provider, body.apiKey, body.models || []);

		return c.json(
			{
				id: key.id,
				provider: key.provider,
				health: key.health_status,
				isActive: key.is_active === 1,
				createdAt: key.created_at,
				message: "Key added successfully",
			},
			201,
		);
	});

	app.get("/keys", async (c) => {
		const keyPool = new KeyPoolService(c.env.DB);
		const dbKeys = await keyPool.getAllKeys();
		const keys = dbKeys.map((k) => ({
			id: k.id,
			provider: k.provider,
			health: k.health_status,
			isActive: k.is_active === 1,
			supportedModels: k.supported_models ? JSON.parse(k.supported_models) : [],
			failureCount: 0, // Migrated to strict HTTP tracking
			lastUsedAt: Date.now(),
			createdAt: k.created_at,
		}));
		return c.json({ data: keys });
	});

	app.delete("/keys/:id", async (c) => {
		const keyPool = new KeyPoolService(c.env.DB);
		const id = c.req.param("id");
		const success = await keyPool.removeKey(id);
		if (!success) {
			throw new ApiError("Key not found", 404, "not_found", "key_not_found");
		}
		return c.json({ message: "Key removed", id });
	});

	app.get("/keys/:id/balance", async (c) => {
		const id = c.req.param("id");
		const dao = new KeysDao(c.env.DB);
		const key = await dao.getKey(id);

		if (!key) {
			throw new ApiError("Key not found", 404, "not_found", "key_not_found");
		}

		const provider = getProvider(key.provider);
		if (!provider) {
			throw new ApiError("Provider not found", 500);
		}

		const balance = await provider.checkBalance(key.api_key_encrypted);
		return c.json({
			id: key.id,
			provider: key.provider,
			balance,
		});
	});

	// ─── Pool Stats ────────────────────────────────────────────────

	app.get("/pool/stats", async (c) => {
		const keyPool = new KeyPoolService(c.env.DB);
		return c.json(await keyPool.getStats());
	});

	// ─── Provider Info ─────────────────────────────────────────────

	app.get("/providers", (c) => {
		const providers = getAllProviders().map((p) => ({
			id: p.info.id,
			name: p.info.name,
			openaiCompatible: p.info.openaiCompatible,
		}));
		return c.json({ data: providers });
	});
}

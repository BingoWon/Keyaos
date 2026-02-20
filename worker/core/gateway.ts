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
import { ApiError, BadRequestError } from "../shared/errors";
import { dispatch } from "./dispatcher";
import { keyPool } from "./key-pool";
import {
	getAllProviders,
	getProvider,
	getProviderIds,
} from "./providers/registry";

export function createCoreRoutes(app: Hono<{ Bindings: Env }>) {
	// ─── Chat Completions (main endpoint) ──────────────────────────

	app.post("/v1/chat/completions", async (c) => {
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
		const { key, provider, upstreamModel } = dispatch(model);

		// Override model in body to the upstream model name
		const upstreamBody = { ...body, model: upstreamModel };

		try {
			// Forward request
			const response = await provider.forwardRequest(
				key.apiKey,
				c.req.raw,
				upstreamBody,
			);

			// Report success
			keyPool.reportSuccess(key.id);

			// Transparent proxy: return upstream response as-is
			return response;
		} catch (err) {
			// Report failure
			const statusCode = err instanceof ApiError ? err.statusCode : 500;
			keyPool.reportFailure(key.id, statusCode);
			throw err;
		}
	});

	// ─── Models listing ────────────────────────────────────────────

	app.get("/v1/models", async (c) => {
		// Aggregate models from all providers that have active keys
		const allModels: unknown[] = [];
		const seenProviders = new Set<string>();

		for (const key of keyPool.getAllKeys()) {
			if (!key.isActive || key.health === "dead") continue;
			if (seenProviders.has(key.provider)) continue;
			seenProviders.add(key.provider);

			const provider = getProvider(key.provider);
			if (!provider) continue;

			try {
				const result = (await provider.listModels(key.apiKey)) as {
					data?: unknown[];
				};
				if (result?.data) {
					allModels.push(...result.data);
				}
			} catch {
				// Skip providers that fail
				console.error(`Failed to list models from ${key.provider}`);
			}
		}

		return c.json({ object: "list", data: allModels });
	});

	// ─── Key Management ────────────────────────────────────────────

	app.post("/keys", async (c) => {
		let body: { provider: string; apiKey: string; models?: string[] };
		try {
			body = await c.req.json();
		} catch {
			throw new BadRequestError("Invalid JSON body");
		}

		if (!body.provider || !body.apiKey) {
			throw new BadRequestError("provider and apiKey are required");
		}

		// Validate provider exists
		const providerIds = getProviderIds();
		if (!providerIds.includes(body.provider)) {
			throw new BadRequestError(
				`Unknown provider: ${body.provider}. Supported: ${providerIds.join(", ")}`,
			);
		}

		// Validate key with the provider
		const provider = getProvider(body.provider)!;
		const isValid = await provider.validateKey(body.apiKey);
		if (!isValid) {
			throw new BadRequestError(
				`Invalid API key for ${body.provider}. The key was rejected by the provider.`,
			);
		}

		// Add to pool
		const key = keyPool.addKey(body.provider, body.apiKey, body.models || []);

		return c.json(
			{
				id: key.id,
				provider: key.provider,
				health: key.health,
				isActive: key.isActive,
				createdAt: key.createdAt,
				message: "Key added successfully",
			},
			201,
		);
	});

	app.get("/keys", (c) => {
		const keys = keyPool.getAllKeys().map((k) => ({
			id: k.id,
			provider: k.provider,
			health: k.health,
			isActive: k.isActive,
			supportedModels: k.supportedModels,
			failureCount: k.failureCount,
			lastUsedAt: k.lastUsedAt,
			createdAt: k.createdAt,
			// Never expose the actual API key
		}));
		return c.json({ data: keys });
	});

	app.delete("/keys/:id", (c) => {
		const id = c.req.param("id");
		const success = keyPool.removeKey(id);
		if (!success) {
			throw new ApiError("Key not found", 404, "not_found", "key_not_found");
		}
		return c.json({ message: "Key removed", id });
	});

	app.get("/keys/:id/balance", async (c) => {
		const id = c.req.param("id");
		const key = keyPool.getKey(id);
		if (!key) {
			throw new ApiError("Key not found", 404, "not_found", "key_not_found");
		}

		const provider = getProvider(key.provider);
		if (!provider) {
			throw new ApiError("Provider not found", 500);
		}

		const balance = await provider.checkBalance(key.apiKey);
		return c.json({
			id: key.id,
			provider: key.provider,
			balance,
		});
	});

	// ─── Pool Stats ────────────────────────────────────────────────

	app.get("/pool/stats", (c) => {
		return c.json(keyPool.getStats());
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

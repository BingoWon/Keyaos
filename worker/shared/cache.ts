import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./types";

/**
 * Edge-cache middleware using the Workers Cache API.
 * Caches successful JSON responses for `ttl` seconds, keyed by full request URL.
 * Shared across all users — only use for public/global data endpoints.
 *
 * Browser caching is explicitly disabled (`no-store`) so the browser always
 * sends a real request to the CDN edge, which serves from Workers Cache API.
 *
 * Keep `ttl` in sync with the frontend auto-refresh interval in `src/config.ts`
 * (REFRESH_INTERVAL_MS) so cache expiry aligns with the polling cadence.
 *
 * On custom domains the Cache API is functional; on *.workers.dev it no-ops
 * silently (cache.match returns undefined, cache.put is ignored).
 */
export const edgeCache = (ttl = 30) =>
	createMiddleware<AppEnv>(async (c, next) => {
		const cache = caches.default;
		const key = new Request(c.req.url, { method: "GET" });

		const hit = await cache.match(key);
		if (hit) {
			const res = new Response(hit.body, hit);
			res.headers.set("Cache-Control", "no-store");
			return res;
		}

		await next();

		// Prevent browser from heuristic-caching the JSON response
		c.header("Cache-Control", "no-store");

		if (c.res.ok) {
			const cached = new Response(c.res.clone().body, {
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": `s-maxage=${ttl}`,
				},
			});
			c.executionCtx.waitUntil(cache.put(key, cached));
		}
	});

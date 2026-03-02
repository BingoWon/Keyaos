import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./types";

/**
 * Edge-cache middleware using the Workers Cache API.
 * Caches successful JSON responses for `ttl` seconds, keyed by full request URL.
 * Shared across all users — only use for public/global data endpoints.
 *
 * On custom domains the Cache API is functional; on *.workers.dev it no-ops
 * silently (cache.match returns undefined, cache.put is ignored).
 */
export const edgeCache = (ttl = 60) =>
	createMiddleware<AppEnv>(async (c, next) => {
		const cache = caches.default;
		const key = new Request(c.req.url, { method: "GET" });

		const hit = await cache.match(key);
		if (hit) return new Response(hit.body, hit);

		await next();

		if (c.res.ok) {
			const res = new Response(c.res.clone().body, {
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": `s-maxage=${ttl}`,
				},
			});
			c.executionCtx.waitUntil(cache.put(key, res));
		}
	});

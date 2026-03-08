import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";

interface FetchOptions extends RequestInit {
	requireAuth?: boolean;
	skip?: boolean;
	/** Cache freshness window in ms (default 30 000). Set 0 to disable caching. */
	staleTime?: number;
}

const cache = new Map<string, { data: unknown; ts: number }>();

/** Invalidate cache entries matching a URL prefix, or clear all if omitted. */
export function invalidateCache(prefix?: string) {
	if (!prefix) {
		cache.clear();
		return;
	}
	for (const key of cache.keys()) {
		if (key.startsWith(prefix)) cache.delete(key);
	}
}

export function useFetch<T>(url: string, options: FetchOptions = {}) {
	const {
		requireAuth = true,
		skip = false,
		staleTime = 30_000,
		...fetchOptions
	} = options;
	const { getToken, signOut } = useAuth();
	const optionsRef = useRef(fetchOptions);
	optionsRef.current = fetchOptions;

	const hit = !skip ? cache.get(url) : undefined;
	const [data, setData] = useState<T | null>(hit ? (hit.data as T) : null);
	const [loading, setLoading] = useState(!hit);
	const [error, setError] = useState<Error | null>(null);

	const execute = useCallback(
		async (signal: AbortSignal) => {
			if (skip) {
				setLoading(false);
				return;
			}

			const hit = cache.get(url);
			if (hit) {
				setData(hit.data as T);
				if (Date.now() - hit.ts < staleTime) {
					setLoading(false);
					return;
				}
				setLoading(false);
			} else {
				setLoading(true);
			}
			setError(null);

			try {
				const headers = new Headers(optionsRef.current.headers);
				if (requireAuth) {
					const token = await getToken();
					if (token) headers.set("Authorization", `Bearer ${token}`);
				}

				const res = await fetch(url, {
					...optionsRef.current,
					headers,
					signal,
				});

				if (res.status === 401) {
					signOut();
					throw new Error("Unauthorized");
				}
				if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

				const json = await res.json();
				const result = json.data !== undefined ? json.data : json;
				cache.set(url, { data: result, ts: Date.now() });
				setData(result as T);
			} catch (err: unknown) {
				if ((err as Error).name !== "AbortError") {
					setError(err instanceof Error ? err : new Error("Unknown Error"));
				}
			} finally {
				setLoading(false);
			}
		},
		[url, getToken, requireAuth, skip, signOut, staleTime],
	);

	useEffect(() => {
		const controller = new AbortController();
		execute(controller.signal);
		return () => controller.abort();
	}, [execute]);

	const refetch = useCallback(() => {
		const hit = cache.get(url);
		if (hit) hit.ts = 0;
		const controller = new AbortController();
		execute(controller.signal);
	}, [execute, url]);

	return { data, loading, error, refetch };
}

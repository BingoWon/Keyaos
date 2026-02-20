import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../stores/auth";

interface FetchOptions extends RequestInit {
	requireAuth?: boolean;
}

export function useFetch<T>(url: string, options: FetchOptions = {}) {
	const { requireAuth = true, ...fetchOptions } = options;
	const { token, logout } = useAuth();

	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<Error | null>(null);

	const execute = useCallback(async () => {
		const controller = new AbortController();
		setLoading(true);
		setError(null);

		try {
			const headers = new Headers(fetchOptions.headers);
			if (requireAuth && token) {
				headers.set("Authorization", `Bearer ${token}`);
			}

			const res = await fetch(url, {
				...fetchOptions,
				headers,
				signal: controller.signal,
			});

			if (res.status === 401) {
				logout();
				throw new Error("Unauthorized");
			}

			if (!res.ok) {
				throw new Error(`HTTP Error ${res.status}`);
			}

			const json = await res.json();
			// Handle standard Hono backend json envelope `{ data: T }`
			setData(json.data !== undefined ? json.data : json);
		} catch (err: unknown) {
			if ((err as Error).name !== "AbortError") {
				setError(err instanceof Error ? err : new Error("Unknown Error"));
			}
		} finally {
			setLoading(false);
		}

		return () => controller.abort();
	}, [url, token, requireAuth, logout, fetchOptions.method]); // stringified check for complex options is better but omitted for MVP

	useEffect(() => {
		const abort = execute();
		return () => {
			abort.then((cancel) => cancel());
		};
	}, [execute]);

	return { data, loading, error, refetch: execute };
}

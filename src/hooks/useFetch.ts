import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";

interface FetchOptions extends RequestInit {
	requireAuth?: boolean;
}

export function useFetch<T>(url: string, options: FetchOptions = {}) {
	const { requireAuth = true, ...fetchOptions } = options;
	const { getToken, signOut } = useAuth();

	const optionsRef = useRef(fetchOptions);
	optionsRef.current = fetchOptions;

	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<Error | null>(null);

	const execute = useCallback(
		async (signal: AbortSignal) => {
			setLoading(true);
			setError(null);

			try {
				const opts = optionsRef.current;
				const headers = new Headers(opts.headers);
				if (requireAuth) {
					const activeToken = await getToken();
					if (activeToken) {
						headers.set("Authorization", `Bearer ${activeToken}`);
					}
				}

				const res = await fetch(url, { ...opts, headers, signal });

				if (res.status === 401) {
					signOut();
					throw new Error("Unauthorized");
				}

				if (!res.ok) {
					throw new Error(`HTTP Error ${res.status}`);
				}

				const json = await res.json();
				setData(json.data !== undefined ? json.data : json);
			} catch (err: unknown) {
				if ((err as Error).name !== "AbortError") {
					setError(err instanceof Error ? err : new Error("Unknown Error"));
				}
			} finally {
				setLoading(false);
			}
		},
		[url, getToken, requireAuth, signOut],
	);

	useEffect(() => {
		const controller = new AbortController();
		execute(controller.signal);
		return () => controller.abort();
	}, [execute]);

	const refetch = useCallback(() => {
		const controller = new AbortController();
		execute(controller.signal);
	}, [execute]);

	return { data, loading, error, refetch };
}

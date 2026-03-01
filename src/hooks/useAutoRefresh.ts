import { useEffect, useState } from "react";

const DEFAULT_INTERVAL = 60_000;

/**
 * Auto-refresh on a fixed interval and track when data last arrived.
 * Returns the Date of the most recent successful fetch, or null before first load.
 */
export function useAutoRefresh(
	refetch: () => void,
	data: unknown,
	intervalMs = DEFAULT_INTERVAL,
): Date | null {
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	useEffect(() => {
		if (data != null) setLastUpdated(new Date());
	}, [data]);

	useEffect(() => {
		const id = setInterval(refetch, intervalMs);
		return () => clearInterval(id);
	}, [refetch, intervalMs]);

	return lastUpdated;
}

import { useEffect, useState } from "react";
import { REFRESH_INTERVAL_MS } from "../config";

/**
 * Auto-refresh on a fixed interval and track when data last arrived.
 * Returns the Date of the most recent successful fetch, or null before first load.
 */
export function useAutoRefresh(
	refetch: () => void,
	data: unknown,
	intervalMs = REFRESH_INTERVAL_MS,
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

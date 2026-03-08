/**
 * Global timing constants shared across the frontend.
 *
 * The CDN edge-cache TTL is configured in `worker/shared/cache.ts` and should
 * stay in sync with REFRESH_INTERVAL_MS so auto-refresh aligns with cache expiry.
 */

/** How often useAutoRefresh polls for new data (ms). */
export const REFRESH_INTERVAL_MS = 30_000;

/**
 * In-memory (provider, model) circuit breaker.
 *
 * Tracks consecutive failures per (provider_id, model_id) pair.
 * After THRESHOLD failures within WINDOW_MS, the pair is considered
 * "open" (broken) and should be skipped by the gateway retry loop.
 *
 * Auto-recovery: entries expire after WINDOW_MS with no new failures.
 * Worker restart resets all state (acceptable — equivalent to a retry).
 */

const THRESHOLD = 3;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface Entry {
	count: number;
	lastFailure: number;
}

const breakers = new Map<string, Entry>();

function key(providerId: string, modelId: string): string {
	return `${providerId}\0${modelId}`;
}

/** Record a failure for a (provider, model) pair. */
export function recordFailure(providerId: string, modelId: string): void {
	const k = key(providerId, modelId);
	const now = Date.now();
	const existing = breakers.get(k);

	if (existing && now - existing.lastFailure < WINDOW_MS) {
		existing.count++;
		existing.lastFailure = now;
	} else {
		breakers.set(k, { count: 1, lastFailure: now });
	}
}

/** Check if a (provider, model) pair is circuit-broken. */
export function isOpen(providerId: string, modelId: string): boolean {
	const k = key(providerId, modelId);
	const entry = breakers.get(k);
	if (!entry) return false;
	if (Date.now() - entry.lastFailure >= WINDOW_MS) {
		breakers.delete(k);
		return false;
	}
	return entry.count >= THRESHOLD;
}

/** Record a success — immediately resets the circuit for this pair. */
export function recordSuccess(providerId: string, modelId: string): void {
	breakers.delete(key(providerId, modelId));
}

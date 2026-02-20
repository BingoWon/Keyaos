/**
 * Key pool management
 *
 * In-memory key pool for the initial implementation.
 * Will be replaced by D1 storage later.
 */

export interface PoolKey {
	/** Unique key id */
	id: string;
	/** Provider id (e.g. "openrouter", "zenmux") */
	provider: string;
	/** The actual API key */
	apiKey: string;
	/** Models this key can access (empty = all models on the provider) */
	supportedModels: string[];
	/** Whether this key is currently active */
	isActive: boolean;
	/** Health status */
	health: "ok" | "degraded" | "dead";
	/** Number of consecutive failures */
	failureCount: number;
	/** Last time this key was used */
	lastUsedAt: number;
	/** When this key was added */
	createdAt: number;
}

/**
 * In-memory key pool.
 * Keys are stored in a Map keyed by their id.
 */
class KeyPool {
	private keys = new Map<string, PoolKey>();
	private nextId = 1;

	/**
	 * Add a key to the pool.
	 */
	addKey(
		provider: string,
		apiKey: string,
		supportedModels: string[] = [],
	): PoolKey {
		const id = `key_${this.nextId++}`;
		const key: PoolKey = {
			id,
			provider,
			apiKey,
			supportedModels,
			isActive: true,
			health: "ok",
			failureCount: 0,
			lastUsedAt: 0,
			createdAt: Date.now(),
		};
		this.keys.set(id, key);
		return key;
	}

	/**
	 * Remove a key from the pool.
	 */
	removeKey(id: string): boolean {
		return this.keys.delete(id);
	}

	/**
	 * Get all keys for a specific provider.
	 */
	getKeysForProvider(provider: string): PoolKey[] {
		return Array.from(this.keys.values()).filter(
			(k) => k.provider === provider,
		);
	}

	/**
	 * Get available keys for a specific provider and model.
	 * Returns only active, healthy keys.
	 */
	getAvailableKeys(provider: string, model?: string): PoolKey[] {
		return Array.from(this.keys.values()).filter((k) => {
			if (k.provider !== provider) return false;
			if (!k.isActive) return false;
			if (k.health === "dead") return false;
			if (
				model &&
				k.supportedModels.length > 0 &&
				!k.supportedModels.includes(model)
			) {
				return false;
			}
			return true;
		});
	}

	/**
	 * Select the best key for a request using simple round-robin.
	 * Prefers keys that haven't been used recently.
	 */
	selectKey(provider: string, model?: string): PoolKey | null {
		const available = this.getAvailableKeys(provider, model);
		if (available.length === 0) return null;

		// Sort by lastUsedAt ascending (least recently used first)
		// Prefer "ok" health over "degraded"
		available.sort((a, b) => {
			if (a.health !== b.health) {
				return a.health === "ok" ? -1 : 1;
			}
			return a.lastUsedAt - b.lastUsedAt;
		});

		const selected = available[0];
		selected.lastUsedAt = Date.now();
		return selected;
	}

	/**
	 * Report a successful use of a key.
	 */
	reportSuccess(id: string): void {
		const key = this.keys.get(id);
		if (key) {
			key.failureCount = 0;
			key.health = "ok";
		}
	}

	/**
	 * Report a failed use of a key.
	 */
	reportFailure(id: string, statusCode?: number): void {
		const key = this.keys.get(id);
		if (!key) return;

		key.failureCount++;

		// 401/403 = key is dead (revoked or invalid)
		if (statusCode === 401 || statusCode === 403) {
			key.health = "dead";
			key.isActive = false;
			return;
		}

		// 402 = out of balance
		if (statusCode === 402) {
			key.health = "dead";
			key.isActive = false;
			return;
		}

		// 3 consecutive failures = dead
		if (key.failureCount >= 3) {
			key.health = "dead";
			key.isActive = false;
		} else {
			key.health = "degraded";
		}
	}

	/**
	 * Get all keys (for admin/debug).
	 */
	getAllKeys(): PoolKey[] {
		return Array.from(this.keys.values());
	}

	/**
	 * Get a key by id.
	 */
	getKey(id: string): PoolKey | undefined {
		return this.keys.get(id);
	}

	/**
	 * Get pool stats.
	 */
	getStats(): {
		total: number;
		active: number;
		byProvider: Record<string, number>;
	} {
		const all = this.getAllKeys();
		const byProvider: Record<string, number> = {};
		let active = 0;

		for (const k of all) {
			byProvider[k.provider] = (byProvider[k.provider] || 0) + 1;
			if (k.isActive && k.health !== "dead") active++;
		}

		return { total: all.length, active, byProvider };
	}
}

/** Singleton key pool instance */
export const keyPool = new KeyPool();

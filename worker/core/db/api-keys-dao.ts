import { decrypt, encrypt, mask, sha256 } from "../../shared/crypto";
import type { DbApiKey } from "./schema";

export class ApiKeysDao {
	constructor(
		private db: D1Database,
		private encryptionKey: string,
	) {}

	/** Creates a key and returns the plaintext key (shown once, never stored). */
	async createKey(
		name: string,
		owner_id: string,
	): Promise<{ record: DbApiKey; plainKey: string }> {
		const id = `key_${crypto.randomUUID().replace(/-/g, "")}`;
		const plainKey = `sk-keyaos-${crypto.randomUUID().replace(/-/g, "")}`;

		const [keyHash, encryptedKey] = await Promise.all([
			sha256(plainKey),
			encrypt(plainKey, this.encryptionKey),
		]);
		const keyHint = mask(plainKey, 10, 4);

		await this.db
			.prepare(
				`INSERT INTO api_keys (id, owner_id, name, key_hash, encrypted_key, key_hint, is_enabled, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
			)
			.bind(id, owner_id, name, keyHash, encryptedKey, keyHint, Date.now())
			.run();

		const record = await this.db
			.prepare("SELECT * FROM api_keys WHERE id = ?")
			.bind(id)
			.first<DbApiKey>();
		if (!record) throw new Error("Failed to create downstream API key");
		return { record, plainKey };
	}

	/** Lookup a key by SHA-256 hash of the plaintext token (for auth). */
	async getByHash(keyHash: string): Promise<DbApiKey | null> {
		return this.db
			.prepare("SELECT * FROM api_keys WHERE key_hash = ?")
			.bind(keyHash)
			.first<DbApiKey>();
	}

	async listKeys(owner_id: string): Promise<DbApiKey[]> {
		const res = await this.db
			.prepare(
				"SELECT * FROM api_keys WHERE owner_id = ? ORDER BY created_at DESC",
			)
			.bind(owner_id)
			.all<DbApiKey>();
		return res.results || [];
	}

	/** Decrypt and return the full plaintext key (for reveal). */
	async revealKey(id: string, owner_id: string): Promise<string | null> {
		const row = await this.db
			.prepare(
				"SELECT encrypted_key FROM api_keys WHERE id = ? AND owner_id = ?",
			)
			.bind(id, owner_id)
			.first<{ encrypted_key: string }>();
		if (!row) return null;
		return decrypt(row.encrypted_key, this.encryptionKey);
	}

	async updateKey(
		id: string,
		owner_id: string,
		updates: { name?: string; is_enabled?: number },
	): Promise<boolean> {
		const sets: string[] = [];
		const values: unknown[] = [];
		if (updates.name !== undefined) {
			sets.push("name = ?");
			values.push(updates.name);
		}
		if (updates.is_enabled !== undefined) {
			sets.push("is_enabled = ?");
			values.push(updates.is_enabled);
		}
		if (sets.length === 0) return false;

		const result = await this.db
			.prepare(
				`UPDATE api_keys SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`,
			)
			.bind(...values, id, owner_id)
			.run();
		return (result.meta?.changes ?? 0) > 0;
	}

	async deleteKey(id: string, owner_id: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM api_keys WHERE id = ? AND owner_id = ?")
			.bind(id, owner_id)
			.run();
		return result.success && result.meta?.rows_written === 1;
	}
}

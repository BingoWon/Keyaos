import type { DbApiKey } from "./schema";

export class ApiKeysDao {
	constructor(private db: D1Database) {}

	async createKey(name: string, owner_id: string): Promise<DbApiKey> {
		const id = `sk-keyaos-${crypto.randomUUID().replace(/-/g, "")}`;

		await this.db
			.prepare(
				`INSERT INTO api_keys (id, owner_id, name, is_enabled, created_at)
				 VALUES (?, ?, ?, 1, ?)`,
			)
			.bind(id, owner_id, name, Date.now())
			.run();

		const key = await this.getKey(id);
		if (!key) throw new Error("Failed to create downstream API key");
		return key;
	}

	async getKey(id: string): Promise<DbApiKey | null> {
		return this.db
			.prepare("SELECT * FROM api_keys WHERE id = ?")
			.bind(id)
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

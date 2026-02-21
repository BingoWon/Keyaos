import type { DbApiKey } from "./schema";

export class ApiKeysDao {
	constructor(private db: D1Database) {}

	async createKey(name: string): Promise<DbApiKey> {
		const id = `sk-keyaos-${crypto.randomUUID().replace(/-/g, "")}`;

		await this.db
			.prepare(
				`INSERT INTO api_keys (id, name, is_active, created_at)
				 VALUES (?, ?, 1, ?)`,
			)
			.bind(id, name, Date.now())
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

	async listKeys(): Promise<DbApiKey[]> {
		const res = await this.db
			.prepare("SELECT * FROM api_keys ORDER BY created_at DESC")
			.all<DbApiKey>();
		return res.results || [];
	}

	async deleteKey(id: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM api_keys WHERE id = ?")
			.bind(id)
			.run();
		return result.success && result.meta?.rows_written === 1;
	}
}

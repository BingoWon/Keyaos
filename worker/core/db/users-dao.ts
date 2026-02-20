/**
 * Users Data Access Object
 */
import type { DbUser } from "./schema";

export class UsersDao {
    constructor(private db: D1Database) { }

    async getUserByEmail(email: string): Promise<DbUser | null> {
        return await this.db
            .prepare("SELECT * FROM users WHERE email = ?")
            .bind(email)
            .first<DbUser>();
    }

    async getUserByApiKey(apiKey: string): Promise<DbUser | null> {
        return await this.db
            .prepare("SELECT * FROM users WHERE api_key = ?")
            .bind(apiKey)
            .first<DbUser>();
    }

    /**
     * Creates a new user or returns existing if email matches.
     */
    async createUser(email: string, apiKey: string): Promise<DbUser> {
        const now = Date.now();
        const id = `user_${crypto.randomUUID()}`;

        await this.db
            .prepare(
                "INSERT INTO users (id, email, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(id, email, apiKey, now, now)
            .run();

        return (await this.getUserByEmail(email))!;
    }

    /**
     * Optimistically deducts balance from a user and updates timestamp.
     * Using SQLite's atomic update ensures isolation.
     */
    async deductBalance(userId: string, cents: number): Promise<boolean> {
        const result = await this.db
            .prepare(
                "UPDATE users SET balance_cents = balance_cents - ?, updated_at = ? WHERE id = ? AND balance_cents >= ?",
            )
            .bind(cents, Date.now(), userId, cents)
            .run();

        return result.success && result.meta?.rows_written === 1;
    }
}

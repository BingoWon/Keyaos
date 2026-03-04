import type { DbChatMessage, DbChatThread } from "./schema";

export class ThreadsDao {
	constructor(private db: D1Database) {}

	async list(
		ownerId: string,
	): Promise<{ threads: DbChatThread[] }> {
		const { results } = await this.db
			.prepare(
				"SELECT * FROM chat_threads WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100",
			)
			.bind(ownerId)
			.all<DbChatThread>();
		return { threads: results };
	}

	async get(id: string, ownerId: string): Promise<DbChatThread | null> {
		return (
			(await this.db
				.prepare(
					"SELECT * FROM chat_threads WHERE id = ? AND owner_id = ?",
				)
				.bind(id, ownerId)
				.first<DbChatThread>()) ?? null
		);
	}

	async create(thread: DbChatThread): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO chat_threads (id, owner_id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.bind(
				thread.id,
				thread.owner_id,
				thread.title,
				thread.model,
				thread.status,
				thread.created_at,
				thread.updated_at,
			)
			.run();
	}

	async updateTitle(
		id: string,
		ownerId: string,
		title: string,
	): Promise<void> {
		await this.db
			.prepare(
				"UPDATE chat_threads SET title = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
			)
			.bind(title, Date.now(), id, ownerId)
			.run();
	}

	async updateModel(
		threadId: string,
		ownerId: string,
		model: string,
	): Promise<void> {
		await this.db
			.prepare(
				"UPDATE chat_threads SET model = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
			)
			.bind(model, Date.now(), threadId, ownerId)
			.run();
	}

	async updateStatus(
		id: string,
		ownerId: string,
		status: "regular" | "archived",
	): Promise<void> {
		await this.db
			.prepare(
				"UPDATE chat_threads SET status = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
			)
			.bind(status, Date.now(), id, ownerId)
			.run();
	}

	async delete(id: string, ownerId: string): Promise<void> {
		await this.db.batch([
			this.db
				.prepare("DELETE FROM chat_messages WHERE thread_id = ?")
				.bind(id),
			this.db
				.prepare(
					"DELETE FROM chat_threads WHERE id = ? AND owner_id = ?",
				)
				.bind(id, ownerId),
		]);
	}

	async getMessages(threadId: string): Promise<DbChatMessage[]> {
		const { results } = await this.db
			.prepare(
				"SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC",
			)
			.bind(threadId)
			.all<DbChatMessage>();
		return results;
	}

	async addMessage(message: DbChatMessage): Promise<void> {
		await this.db.batch([
			this.db
				.prepare(
					"INSERT INTO chat_messages (id, thread_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.bind(
					message.id,
					message.thread_id,
					message.role,
					message.content,
					message.model,
					message.created_at,
				),
			this.db
				.prepare(
					"UPDATE chat_threads SET updated_at = ? WHERE id = ?",
				)
				.bind(Date.now(), message.thread_id),
		]);
	}
}

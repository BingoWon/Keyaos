import type { DbWerewolfSession } from "./schema";

export class WerewolfSessionsDao {
	constructor(private db: D1Database) {}

	async list(ownerId: string, limit = 20): Promise<DbWerewolfSession[]> {
		const { results } = await this.db
			.prepare(
				"SELECT * FROM werewolf_sessions WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?",
			)
			.bind(ownerId, limit)
			.all<DbWerewolfSession>();
		return results;
	}

	async create(session: DbWerewolfSession): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO werewolf_sessions
				(id, owner_id, player_count, difficulty, model_used, winner, completed,
				 rounds_played, duration_seconds, ai_calls_count, ai_input_tokens, ai_output_tokens,
				 created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				session.id,
				session.owner_id,
				session.player_count,
				session.difficulty,
				session.model_used,
				session.winner,
				session.completed,
				session.rounds_played,
				session.duration_seconds,
				session.ai_calls_count,
				session.ai_input_tokens,
				session.ai_output_tokens,
				session.created_at,
				session.updated_at,
			)
			.run();
	}

	private static readonly UPDATABLE_COLS = new Set([
		"winner",
		"completed",
		"rounds_played",
		"duration_seconds",
		"ai_calls_count",
		"ai_input_tokens",
		"ai_output_tokens",
	]);

	async update(
		id: string,
		ownerId: string,
		patch: Partial<
			Pick<
				DbWerewolfSession,
				| "winner"
				| "completed"
				| "rounds_played"
				| "duration_seconds"
				| "ai_calls_count"
				| "ai_input_tokens"
				| "ai_output_tokens"
			>
		>,
	): Promise<boolean> {
		const sets: string[] = [];
		const vals: unknown[] = [];
		for (const [k, v] of Object.entries(patch)) {
			if (v !== undefined && WerewolfSessionsDao.UPDATABLE_COLS.has(k)) {
				sets.push(`${k} = ?`);
				vals.push(v);
			}
		}
		if (sets.length === 0) return false;
		sets.push("updated_at = ?");
		vals.push(Date.now());
		vals.push(id, ownerId);

		const { meta } = await this.db
			.prepare(
				`UPDATE werewolf_sessions SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`,
			)
			.bind(...vals)
			.run();
		return (meta.changes ?? 0) > 0;
	}
}

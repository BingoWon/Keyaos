import type { DbWerewolfCharacter } from "./schema";

export class WerewolfCharactersDao {
	constructor(private db: D1Database) {}

	async list(ownerId: string): Promise<DbWerewolfCharacter[]> {
		const { results } = await this.db
			.prepare(
				"SELECT * FROM werewolf_characters WHERE owner_id = ? AND is_deleted = 0 ORDER BY created_at DESC",
			)
			.bind(ownerId)
			.all<DbWerewolfCharacter>();
		return results;
	}

	async create(char: DbWerewolfCharacter): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO werewolf_characters
				(id, owner_id, display_name, gender, age, mbti, basic_info, style_label, avatar_seed,
				 is_deleted, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
			)
			.bind(
				char.id,
				char.owner_id,
				char.display_name,
				char.gender,
				char.age,
				char.mbti,
				char.basic_info,
				char.style_label,
				char.avatar_seed,
				char.created_at,
				char.updated_at,
			)
			.run();
	}

	private static readonly UPDATABLE_COLS = new Set([
		"display_name",
		"gender",
		"age",
		"mbti",
		"basic_info",
		"style_label",
		"avatar_seed",
	]);

	async update(
		id: string,
		ownerId: string,
		patch: Partial<
			Pick<
				DbWerewolfCharacter,
				| "display_name"
				| "gender"
				| "age"
				| "mbti"
				| "basic_info"
				| "style_label"
				| "avatar_seed"
			>
		>,
	): Promise<boolean> {
		const sets: string[] = [];
		const vals: unknown[] = [];
		for (const [k, v] of Object.entries(patch)) {
			if (v !== undefined && WerewolfCharactersDao.UPDATABLE_COLS.has(k)) {
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
				`UPDATE werewolf_characters SET ${sets.join(", ")} WHERE id = ? AND owner_id = ? AND is_deleted = 0`,
			)
			.bind(...vals)
			.run();
		return (meta.changes ?? 0) > 0;
	}

	async softDelete(id: string, ownerId: string): Promise<boolean> {
		const { meta } = await this.db
			.prepare(
				"UPDATE werewolf_characters SET is_deleted = 1, updated_at = ? WHERE id = ? AND owner_id = ? AND is_deleted = 0",
			)
			.bind(Date.now(), id, ownerId)
			.run();
		return (meta.changes ?? 0) > 0;
	}
}

import { Hono } from "hono";
import { WerewolfCharactersDao } from "../core/db/werewolf-characters-dao";
import { WerewolfSessionsDao } from "../core/db/werewolf-sessions-dao";
import { ApiError } from "../shared/errors";
import type { AppEnv } from "../shared/types";

const werewolfRouter = new Hono<AppEnv>();

// ─── Game Sessions ──────────────────────────────────────

werewolfRouter.get("/sessions", async (c) => {
	const ownerId = c.get("owner_id");
	const limit = Math.min(Number(c.req.query("limit") || 20), 100);
	const dao = new WerewolfSessionsDao(c.env.DB);
	const sessions = await dao.list(ownerId, limit);
	return c.json({ data: sessions });
});

werewolfRouter.post("/sessions", async (c) => {
	const ownerId = c.get("owner_id");
	const body = await c.req.json<{
		id: string;
		player_count: number;
		difficulty?: string;
		model_used?: string;
	}>();
	if (!body.id || !body.player_count) {
		throw new ApiError(400, "id and player_count are required");
	}
	const now = Date.now();
	const dao = new WerewolfSessionsDao(c.env.DB);
	await dao.create({
		id: body.id,
		owner_id: ownerId,
		player_count: body.player_count,
		difficulty: body.difficulty || "normal",
		model_used: body.model_used || null,
		winner: null,
		completed: 0,
		rounds_played: 0,
		duration_seconds: 0,
		ai_calls_count: 0,
		ai_input_tokens: 0,
		ai_output_tokens: 0,
		created_at: now,
		updated_at: now,
	});
	return c.json({ data: { id: body.id } }, 201);
});

werewolfRouter.patch("/sessions/:id", async (c) => {
	const ownerId = c.get("owner_id");
	const id = c.req.param("id");
	const body = await c.req.json<{
		winner?: string | null;
		completed?: number;
		rounds_played?: number;
		duration_seconds?: number;
		ai_calls_count?: number;
		ai_input_tokens?: number;
		ai_output_tokens?: number;
	}>();
	const dao = new WerewolfSessionsDao(c.env.DB);
	const ok = await dao.update(id, ownerId, body);
	if (!ok) throw new ApiError(404, "Session not found");
	return c.json({ data: { id } });
});

// ─── Custom Characters ──────────────────────────────────

werewolfRouter.get("/characters", async (c) => {
	const ownerId = c.get("owner_id");
	const dao = new WerewolfCharactersDao(c.env.DB);
	const characters = await dao.list(ownerId);
	return c.json({ data: characters });
});

werewolfRouter.post("/characters", async (c) => {
	const ownerId = c.get("owner_id");
	const body = await c.req.json<{
		id: string;
		display_name: string;
		gender?: string;
		age?: number;
		mbti?: string;
		basic_info?: string;
		style_label?: string;
		avatar_seed?: string;
	}>();
	if (!body.id || !body.display_name) {
		throw new ApiError(400, "id and display_name are required");
	}
	const now = Date.now();
	const dao = new WerewolfCharactersDao(c.env.DB);
	await dao.create({
		id: body.id,
		owner_id: ownerId,
		display_name: body.display_name,
		gender: body.gender || "male",
		age: body.age ?? 25,
		mbti: body.mbti || "",
		basic_info: body.basic_info || null,
		style_label: body.style_label || null,
		avatar_seed: body.avatar_seed || null,
		is_deleted: 0,
		created_at: now,
		updated_at: now,
	});
	return c.json({ data: { id: body.id } }, 201);
});

werewolfRouter.patch("/characters/:id", async (c) => {
	const ownerId = c.get("owner_id");
	const id = c.req.param("id");
	const body = await c.req.json<{
		display_name?: string;
		gender?: string;
		age?: number;
		mbti?: string;
		basic_info?: string;
		style_label?: string;
		avatar_seed?: string;
	}>();
	const dao = new WerewolfCharactersDao(c.env.DB);
	const ok = await dao.update(id, ownerId, body);
	if (!ok) throw new ApiError(404, "Character not found");
	return c.json({ data: { id } });
});

werewolfRouter.delete("/characters/:id", async (c) => {
	const ownerId = c.get("owner_id");
	const id = c.req.param("id");
	const dao = new WerewolfCharactersDao(c.env.DB);
	const ok = await dao.softDelete(id, ownerId);
	if (!ok) throw new ApiError(404, "Character not found");
	return c.json({ data: { id } });
});

export default werewolfRouter;

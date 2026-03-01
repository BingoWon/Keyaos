import { Hono } from "hono";
import { z } from "zod";
import { ApiKeysDao } from "../core/db/api-keys-dao";
import { ApiError, BadRequestError } from "../shared/errors";
import type { AppEnv } from "../shared/types";
import { parse } from "../shared/validate";

const CreateKeyBody = z.object({
	name: z.string().optional().default("Untitled Key"),
});

const UpdateKeyBody = z.object({
	name: z.string().min(1).optional(),
	isEnabled: z.number().min(0).max(1).optional(),
});

const apiKeysRouter = new Hono<AppEnv>();

apiKeysRouter.post("/", async (c) => {
	const body = parse(
		CreateKeyBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body");
		}),
	);

	const dao = new ApiKeysDao(c.env.DB);
	const key = await dao.createKey(body.name, c.get("owner_id"));

	return c.json({ data: key }, 201);
});

apiKeysRouter.get("/", async (c) => {
	const dao = new ApiKeysDao(c.env.DB);
	const keys = await dao.listKeys(c.get("owner_id"));
	return c.json({ data: keys });
});

apiKeysRouter.patch("/:id", async (c) => {
	const body = parse(
		UpdateKeyBody,
		await c.req.json().catch(() => {
			throw new BadRequestError("Invalid JSON body");
		}),
	);

	const dao = new ApiKeysDao(c.env.DB);
	const success = await dao.updateKey(c.req.param("id"), c.get("owner_id"), {
		name: body.name,
		is_enabled: body.isEnabled,
	});
	if (!success) {
		throw new ApiError(
			"API Key not found",
			404,
			"not_found",
			"api_key_not_found",
		);
	}
	return c.json({ message: "API Key updated" });
});

apiKeysRouter.delete("/:id", async (c) => {
	const dao = new ApiKeysDao(c.env.DB);
	const success = await dao.deleteKey(c.req.param("id"), c.get("owner_id"));
	if (!success) {
		throw new ApiError(
			"API Key not found",
			404,
			"not_found",
			"api_key_not_found",
		);
	}
	return c.json({ message: "API Key removed", id: c.req.param("id") });
});

export default apiKeysRouter;

import { Hono } from "hono";
import { z } from "zod";
import { ApiKeysDao } from "../core/db/api-keys-dao";
import { ApiError, BadRequestError } from "../shared/errors";
import type { AppEnv } from "../shared/types";
import { parse } from "../shared/validate";

const CreateKeyBody = z.object({
	name: z.string().min(1, "name is required"),
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

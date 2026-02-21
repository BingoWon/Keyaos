import { Hono } from "hono";
import { ApiKeysDao } from "../core/db/api-keys-dao";
import type { Env } from "../index";
import { ApiError, BadRequestError } from "../shared/errors";

const apiKeysRouter = new Hono<{ Bindings: Env }>();

apiKeysRouter.post("/", async (c) => {
	let body: { name: string };
	try {
		body = await c.req.json();
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}

	if (!body.name) {
		throw new BadRequestError("name is required");
	}

	const dao = new ApiKeysDao(c.env.DB);
	const key = await dao.createKey(body.name);

	return c.json({ data: key }, 201);
});

apiKeysRouter.get("/", async (c) => {
	const dao = new ApiKeysDao(c.env.DB);
	const keys = await dao.listKeys();
	return c.json({ data: keys });
});

apiKeysRouter.delete("/:id", async (c) => {
	const dao = new ApiKeysDao(c.env.DB);
	const success = await dao.deleteKey(c.req.param("id"));
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

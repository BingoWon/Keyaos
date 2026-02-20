import { Hono } from "hono";
import { KeyPoolService } from "../core/key-pool";
import { getProvider } from "../core/providers/registry";
import type { Env } from "../index";

const modelsRouter = new Hono<{ Bindings: Env }>();

modelsRouter.get("/", async (c) => {
	const keyPool = new KeyPoolService(c.env.DB);
	const allModels: unknown[] = [];
	const seenProviders = new Set<string>();

	const allKeys = await keyPool.getAllKeys();
	for (const key of allKeys) {
		if (key.is_active !== 1 || key.health_status === "dead") continue;
		if (seenProviders.has(key.provider)) continue;
		seenProviders.add(key.provider);

		const provider = getProvider(key.provider);
		if (!provider) continue;

		try {
			const result = (await provider.listModels(key.api_key_encrypted)) as {
				data?: unknown[];
			};
			if (result?.data) {
				allModels.push(...result.data);
			}
		} catch {
			console.error(`Failed to list models from ${key.provider}`);
		}
	}

	return c.json({ object: "list", data: allModels });
});

export default modelsRouter;

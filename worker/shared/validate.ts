import type { z } from "zod";
import { BadRequestError } from "./errors";

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
	const result = schema.safeParse(data);
	if (!result.success) {
		const msg = result.error.issues.map((i) => i.message).join("; ");
		throw new BadRequestError(msg);
	}
	return result.data;
}

/**
 * Structured Logger for Cloudflare Workers Logs
 *
 * Outputs JSON to console so Workers Logs can index, filter, and search
 * by any field (category, requestId, provider, model, etc.).
 */

type Level = "debug" | "info" | "warn" | "error";

type Ctx = Record<string, unknown>;

const write: Record<Level, (json: string) => void> = {
	debug: (s) => console.debug(s),
	info: (s) => console.log(s),
	warn: (s) => console.warn(s),
	error: (s) => console.error(s),
};

function emit(level: Level, category: string, msg: string, ctx?: Ctx) {
	write[level](JSON.stringify({ level, category, msg, ...ctx }));
}

export const log = {
	debug: (cat: string, msg: string, ctx?: Ctx) => emit("debug", cat, msg, ctx),
	info: (cat: string, msg: string, ctx?: Ctx) => emit("info", cat, msg, ctx),
	warn: (cat: string, msg: string, ctx?: Ctx) => emit("warn", cat, msg, ctx),
	error: (cat: string, msg: string, ctx?: Ctx) => emit("error", cat, msg, ctx),
};

/**
 * Creates a request-scoped logger with pre-bound context fields.
 * Every log entry automatically includes requestId and any extra context.
 */
export function requestLogger(requestId: string, extra?: Ctx) {
	const base = { requestId, ...extra };
	return {
		debug: (cat: string, msg: string, ctx?: Ctx) =>
			emit("debug", cat, msg, { ...base, ...ctx }),
		info: (cat: string, msg: string, ctx?: Ctx) =>
			emit("info", cat, msg, { ...base, ...ctx }),
		warn: (cat: string, msg: string, ctx?: Ctx) =>
			emit("warn", cat, msg, { ...base, ...ctx }),
		error: (cat: string, msg: string, ctx?: Ctx) =>
			emit("error", cat, msg, { ...base, ...ctx }),
	};
}

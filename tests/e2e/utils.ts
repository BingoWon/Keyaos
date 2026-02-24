import { execSync } from "node:child_process";

export const API_BASE = process.env.API_BASE || "http://localhost:5173";

export const KEYAOS_KEY = (() => {
	const key = process.env.KEYAOS_API_KEY;
	if (!key) throw new Error("KEYAOS_API_KEY env var is required");
	return key;
})();

export function dbQuery(sql: string): unknown[] {
	const raw = execSync(
		`npx wrangler d1 execute keyaos-db --local --command "${sql.replace(/"/g, '\\"')}" --json 2>/dev/null`,
		{ cwd: process.cwd(), encoding: "utf-8" },
	);
	return JSON.parse(raw)[0]?.results ?? [];
}

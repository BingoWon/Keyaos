/**
 * Transaction & billing e2e test
 *
 * Verifies that a chat completion creates a corresponding usage entry
 * with the correct credential_id.
 */

import assert from "node:assert";
import { execSync } from "node:child_process";
import { test } from "node:test";

const API_BASE = process.env.API_BASE || "http://localhost:5173";
const KEYAOS_KEY = process.env.KEYAOS_API_KEY;
if (!KEYAOS_KEY) throw new Error("KEYAOS_API_KEY env var is required");

function dbQuery(sql: string): unknown[] {
	const raw = execSync(
		`npx wrangler d1 execute keyaos-db --local --command "${sql.replace(/"/g, '\\"')}" --json 2>/dev/null`,
		{ cwd: process.cwd(), encoding: "utf-8" },
	);
	return JSON.parse(raw)[0]?.results ?? [];
}

test("Usage entry created after chat completion with correct credential", async () => {
	const beforeCount = (
		dbQuery("SELECT COUNT(*) as cnt FROM usage") as { cnt: number }[]
	)[0].cnt;

	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${KEYAOS_KEY}`,
		},
		body: JSON.stringify({
			model: "openai/gpt-4o-mini",
			messages: [{ role: "user", content: "Say hello!" }],
			stream: false,
		}),
	});

	assert.strictEqual(res.status, 200);
	const usedCredId = res.headers.get("x-credential-id");
	assert.ok(usedCredId, "Missing x-credential-id header");

	// waitUntil fires async — poll until new ledger entry appears
	let entry: { credential_id: string; base_cost: number } | undefined;
	for (let i = 0; i < 10; i++) {
		await new Promise((r) => setTimeout(r, 500));
		const rows = dbQuery(
			`SELECT credential_id, base_cost FROM usage WHERE credential_id = '${usedCredId}' ORDER BY created_at DESC LIMIT 1`,
		) as { credential_id: string; base_cost: number }[];
		const afterCount = (
			dbQuery("SELECT COUNT(*) as cnt FROM usage") as { cnt: number }[]
		)[0].cnt;
		if (afterCount > beforeCount && rows.length > 0) {
			entry = rows[0];
			break;
		}
	}

	assert.ok(entry, "No matching usage entry found within 5 seconds");
	assert.strictEqual(entry.credential_id, usedCredId);
	assert.ok(entry.base_cost > 0, "Base cost should be positive");
	console.log(
		`  Credential: ${usedCredId?.slice(-8)}, Cost: ${entry.base_cost}`,
	);
});

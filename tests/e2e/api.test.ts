/**
 * API e2e tests — basic endpoint sanity checks
 *
 * Prerequisites:
 * - Local dev server running (pnpm dev)
 * - Real credentials already configured in the database
 * - KEYAOS_API_KEY set in .env.local
 */

import assert from "node:assert";
import { execSync } from "node:child_process";
import test from "node:test";

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

test("Health check", async () => {
	const res = await fetch(`${API_BASE}/health`);
	const data = await res.json();
	assert.strictEqual(res.status, 200);
	assert.strictEqual(data.status, "ok");
});

test("Credentials exist in database", () => {
	const rows = dbQuery(
		"SELECT COUNT(*) as cnt FROM upstream_credentials WHERE is_enabled = 1",
	) as { cnt: number }[];
	assert.ok(rows[0].cnt > 0, "Should have at least 1 enabled credential");
	console.log(`  Enabled credentials: ${rows[0].cnt}`);
});

test("All price_multipliers are <= 1.0", () => {
	const rows = dbQuery(
		"SELECT id, provider, price_multiplier FROM upstream_credentials WHERE price_multiplier > 1.0",
	) as { id: string; provider: string; price_multiplier: number }[];
	assert.strictEqual(
		rows.length,
		0,
		`Found ${rows.length} credentials with multiplier > 1.0: ${rows.map((r) => `${r.provider}=${r.price_multiplier}`).join(", ")}`,
	);
});

test("List models via API", async () => {
	const res = await fetch(`${API_BASE}/v1/models`, {
		headers: { Authorization: `Bearer ${KEYAOS_KEY}` },
	});
	const data = await res.json();
	assert.strictEqual(res.status, 200);
	assert.ok(data.data.length > 0, "Should have models");
	console.log(`  Models: ${data.data.length}`);
});

test("Chat completion (non-streaming)", async () => {
	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${KEYAOS_KEY}`,
		},
		body: JSON.stringify({
			model: "openai/gpt-4o-mini",
			messages: [{ role: "user", content: 'Say "hello" in one word' }],
		}),
	});

	if (res.status !== 200) console.error("Error:", await res.text());
	assert.strictEqual(res.status, 200);

	const data = await res.json();
	assert.ok(data.choices.length > 0);
	assert.ok(res.headers.get("x-provider"), "Missing x-provider header");
	assert.ok(
		res.headers.get("x-credential-id"),
		"Missing x-credential-id header",
	);
	console.log(
		`  Provider: ${res.headers.get("x-provider")}, Cred: ${res.headers.get("x-credential-id")?.slice(-8)}`,
	);
});

test("Chat completion (streaming)", async () => {
	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${KEYAOS_KEY}`,
		},
		body: JSON.stringify({
			model: "openai/gpt-4o-mini",
			messages: [{ role: "user", content: "Count to 3" }],
			stream: true,
		}),
	});

	if (res.status !== 200) console.error("Streaming Error:", await res.text());
	assert.strictEqual(res.status, 200);

	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	let result = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		result += decoder.decode(value);
	}
	assert.ok(result.includes("[DONE]"), "Stream should end with [DONE]");
	assert.ok(res.headers.get("x-provider"), "Missing x-provider header");
	console.log(`  Provider: ${res.headers.get("x-provider")}`);
});

test("Ledger entries exist in database", () => {
	const rows = dbQuery(
		"SELECT COUNT(*) as cnt FROM ledger",
	) as { cnt: number }[];
	console.log(`  Ledger entries: ${rows[0].cnt}`);
});

test("No credential has price_multiplier > 1.0", () => {
	const violators = dbQuery(
		"SELECT id, provider, price_multiplier FROM upstream_credentials WHERE price_multiplier > 1.0",
	) as { id: string; provider: string; price_multiplier: number }[];
	assert.strictEqual(
		violators.length,
		0,
		`Found ${violators.length} credentials with multiplier > 1.0: ${violators.map((r) => `${r.provider}=${r.price_multiplier}`).join(", ")}`,
	);
});

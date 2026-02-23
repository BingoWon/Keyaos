/**
 * Dispatch mechanism e2e tests
 *
 * Verifies that the dispatcher selects credentials based on effective cost
 * (base_price × price_multiplier), preferring lower multipliers.
 *
 * Database state (16 credentials, all < 1.0):
 *   Subscription (0.5): antigravity, gemini-cli, kiro, qwen-code
 *   Non-subscription pairs:
 *     openrouter    0.5 / 0.7
 *     deepinfra     0.5 / 0.7
 *     google-ai-studio 0.5 / 0.7
 *     zenmux        0.6 / 0.8
 *     deepseek      0.6 / 0.8
 *     oaipro        0.6 / 0.8
 *
 * Prerequisites:
 * - Local dev server running (pnpm dev)
 * - KEYAOS_API_KEY in .env.local
 */

import assert from "node:assert";
import { execSync } from "node:child_process";
import { describe, test } from "node:test";

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

interface CredRow {
	id: string;
	provider: string;
	price_multiplier: number;
}

async function chat(
	model: string,
	provider?: string,
): Promise<{
	status: number;
	credentialId: string;
	provider: string;
	body: string;
}> {
	const reqBody: Record<string, unknown> = {
		model,
		messages: [{ role: "user", content: "Say hi" }],
	};
	if (provider) reqBody.provider = provider;

	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${KEYAOS_KEY}`,
		},
		body: JSON.stringify(reqBody),
	});

	const body = await res.text();
	return {
		status: res.status,
		credentialId: res.headers.get("x-credential-id") ?? "",
		provider: res.headers.get("x-provider") ?? "",
		body,
	};
}

// ─── Test 1: Same provider, lower multiplier wins ───────

describe("Dispatch: same-provider ordering by price_multiplier", () => {
	test("OpenRouter: 0.5 credential selected over 0.7", async () => {
		const creds = dbQuery(
			"SELECT id, provider, price_multiplier FROM upstream_credentials WHERE provider = 'openrouter' AND is_enabled = 1 ORDER BY price_multiplier ASC",
		) as CredRow[];

		assert.ok(creds.length >= 2, `Need 2 OpenRouter creds, found ${creds.length}`);
		const cheapest = creds[0]; // 0.5

		const result = await chat("openai/gpt-4o-mini", "openrouter");
		console.log(
			`  creds: ${creds.map((c) => `${c.id.slice(-8)}@${c.price_multiplier}`).join(", ")} → selected=${result.credentialId.slice(-8)}`,
		);

		assert.strictEqual(result.status, 200, `Chat failed: ${result.body}`);
		assert.strictEqual(
			result.credentialId,
			cheapest.id,
			`Expected cheapest credential (${cheapest.price_multiplier}) to be selected`,
		);
	});

	test("DeepSeek: 0.6 credential selected over 0.8", async () => {
		const creds = dbQuery(
			"SELECT id, provider, price_multiplier FROM upstream_credentials WHERE provider = 'deepseek' AND is_enabled = 1 ORDER BY price_multiplier ASC",
		) as CredRow[];

		assert.ok(creds.length >= 2, `Need 2 DeepSeek creds, found ${creds.length}`);
		const cheapest = creds[0]; // 0.6

		const result = await chat("deepseek/deepseek-chat", "deepseek");
		console.log(
			`  creds: ${creds.map((c) => `${c.id.slice(-8)}@${c.price_multiplier}`).join(", ")} → selected=${result.credentialId.slice(-8)}`,
		);

		assert.strictEqual(result.status, 200, `Chat failed: ${result.body}`);
		assert.strictEqual(
			result.credentialId,
			cheapest.id,
			`Expected cheapest credential (${cheapest.price_multiplier}) to be selected`,
		);
	});
});

// ─── Test 2: Cross-provider effective cost comparison ───

describe("Dispatch: cross-provider effective cost", () => {
	test("openai/gpt-4o-mini: provider with lowest effective cost wins", async () => {
		// gpt-4o-mini is available on: openrouter(0.5), zenmux(0.6), oaipro(0.6), openai(N/A if no cred)
		// openrouter base=250 * 0.5 = 125, zenmux base=250 * 0.6 = 150
		// openrouter should win
		const result = await chat("openai/gpt-4o-mini");
		console.log(
			`  selected provider=${result.provider}, cred=${result.credentialId.slice(-8)}`,
		);

		assert.strictEqual(result.status, 200, `Chat failed: ${result.body}`);

		// With these multipliers, openrouter@0.5 or deepinfra@0.5 should have lowest effective cost
		// The actual winner depends on base prices in model_pricing
		const prices = dbQuery(
			"SELECT provider, input_price FROM model_pricing WHERE model_id = 'openai/gpt-4o-mini' AND is_active = 1 ORDER BY input_price ASC",
		) as { provider: string; input_price: number }[];

		const credMap = new Map<string, number>();
		const creds = dbQuery(
			"SELECT provider, MIN(price_multiplier) as best_mult FROM upstream_credentials WHERE is_enabled = 1 AND health_status != 'dead' GROUP BY provider",
		) as { provider: string; best_mult: number }[];
		for (const c of creds) credMap.set(c.provider, c.best_mult);

		const ranked = prices
			.filter((p) => credMap.has(p.provider))
			.map((p) => ({
				provider: p.provider,
				effectiveCost: p.input_price * (credMap.get(p.provider) ?? 1),
			}))
			.sort((a, b) => a.effectiveCost - b.effectiveCost);

		console.log(
			`  effective cost ranking: ${ranked.slice(0, 4).map((r) => `${r.provider}=${r.effectiveCost.toFixed(1)}`).join(", ")}`,
		);

		assert.strictEqual(
			result.provider,
			ranked[0].provider,
			`Expected ${ranked[0].provider} (lowest effective cost ${ranked[0].effectiveCost}) but got ${result.provider}`,
		);
	});
});

// ─── Test 3: Ledger records the correct credential ──────

describe("Dispatch: billing correctness", () => {
	test("Ledger entry matches selected credential", async () => {
		const result = await chat("openai/gpt-4o-mini", "openrouter");
		assert.strictEqual(result.status, 200, `Chat failed: ${result.body}`);
		assert.ok(result.credentialId, "Missing x-credential-id header");

		// Wait for async billing via waitUntil
		await new Promise((r) => setTimeout(r, 2000));

		const usageRows = dbQuery(
			"SELECT credential_id, base_cost FROM usage ORDER BY created_at DESC LIMIT 1",
		) as { credential_id: string; base_cost: number }[];

		assert.ok(usageRows.length > 0, "No usage entry found after chat");
		assert.strictEqual(
			usageRows[0].credential_id,
			result.credentialId,
			"Usage credential_id must match x-credential-id response header",
		);
		assert.ok(usageRows[0].base_cost > 0, "Base cost must be positive");
		console.log(
			`  cred=${result.credentialId.slice(-8)}, base_cost=${usageRows[0].base_cost}`,
		);
	});
});

// ─── Test 4: Basic resilience ───────────────────────────

describe("Dispatch: resilience", () => {
	test("DeepSeek model responds successfully via dispatch", async () => {
		const result = await chat("deepseek/deepseek-chat");
		assert.strictEqual(result.status, 200, `Chat failed: ${result.body}`);
		assert.ok(result.provider, "Missing x-provider header");
		assert.ok(result.credentialId, "Missing x-credential-id header");
		console.log(
			`  provider=${result.provider}, cred=${result.credentialId.slice(-8)}`,
		);
	});
});

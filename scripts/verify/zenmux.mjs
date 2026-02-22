/**
 * ZenMux — API verification and credential validation
 *
 * Tests: key validation, models listing, and chat completion.
 * ZenMux uses standard OpenAI-compatible API at https://zenmux.ai/api/v1.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = resolve(ROOT, ".env.local");
const env = Object.fromEntries(
	readFileSync(envPath, "utf-8")
		.split("\n")
		.filter((l) => l && !l.startsWith("#"))
		.map((l) => l.split("=").map((s) => s.trim())),
);

const API_KEY = env.ZENMUX_KEY;
if (!API_KEY) {
	console.error("❌ ZENMUX_KEY not found in .env.local");
	process.exit(1);
}

const BASE = "https://zenmux.ai/api/v1";
const results = {};

// ─── 1. Key validation via /models ───────────────────────
console.log("=== 1. Key Validation (/models) ===");
try {
	const res = await fetch(`${BASE}/models`, {
		headers: { Authorization: `Bearer ${API_KEY}` },
	});
	console.log(`   HTTP ${res.status}`);
	if (res.ok) {
		const json = await res.json();
		const count = json.data?.length ?? 0;
		console.log(`✅ Valid — ${count} models`);
		results.validation = { status: 200, model_count: count };
	} else {
		const text = await res.text();
		console.log(`❌ ${text.slice(0, 200)}`);
		results.validation = { status: res.status, error: text.slice(0, 200) };
	}
} catch (e) {
	console.error("❌", e.message);
	results.validation = { error: e.message };
}

// ─── 2. Old validation URL test (documents the bug) ──────
console.log("\n=== 2. Old validationUrl (generation?id=_validate) ===");
try {
	const res = await fetch(`${BASE}/generation?id=_validate`, {
		headers: { Authorization: `Bearer ${API_KEY}` },
	});
	console.log(`   HTTP ${res.status}`);
	console.log(res.status === 404
		? "✅ Confirmed: old validationUrl returns 404 — removed in registry"
		: `⚠️  Unexpected status ${res.status}`);
	results.old_validation = { status: res.status, note: "This endpoint was removed by ZenMux" };
} catch (e) {
	results.old_validation = { error: e.message };
}

// ─── 3. /models is public (invalid key still 200) ───────
console.log("\n=== 3. /models is PUBLIC (invalid key test) ===");
try {
	const res = await fetch(`${BASE}/models`, {
		headers: { Authorization: "Bearer sk-invalid-key" },
	});
	console.log(`   Invalid key → /models HTTP ${res.status}`);
	console.log(res.status === 200
		? "⚠️  Confirmed: /models is public — cannot validate keys via /models"
		: `   Unexpected status ${res.status}`);
	results.models_public = { status: res.status, is_public: res.status === 200 };
} catch (e) {
	results.models_public = { error: e.message };
}

// ─── 3b. Chat completions rejects invalid keys ──────────
console.log("\n=== 3b. Invalid Key Rejection (via chat completions) ===");
try {
	const res = await fetch(`${BASE}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: "Bearer sk-invalid-key",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: "google/gemma-3-12b-it",
			messages: [{ role: "user", content: "." }],
			max_tokens: 1,
		}),
	});
	console.log(`   Invalid key → /chat/completions HTTP ${res.status}`);
	console.log(res.status === 403
		? "✅ Correctly rejected — adapter uses chat completions for validation"
		: `⚠️  Unexpected status ${res.status}`);
	results.invalid_key_chat = { status: res.status };
} catch (e) {
	results.invalid_key_chat = { error: e.message };
}

// ─── 4. Chat completion ──────────────────────────────────
console.log("\n=== 4. Chat Completion ===");
try {
	const res = await fetch(`${BASE}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: "google/gemma-3-12b-it",
			messages: [{ role: "user", content: "Say hello in one word." }],
			max_tokens: 20,
		}),
	});
	console.log(`   HTTP ${res.status}`);
	if (res.ok) {
		const json = await res.json();
		const content = json.choices?.[0]?.message?.content;
		console.log("✅ SUCCESS!");
		console.log(`   model: ${json.model}`);
		console.log(`   output: ${content?.slice(0, 100)}`);
		console.log(`   usage: ${JSON.stringify(json.usage)}`);
		results.chat = { success: true, model: json.model, output: content?.slice(0, 100), usage: json.usage };
	} else {
		const text = await res.text();
		console.log(`❌ ${text.slice(0, 300)}`);
		results.chat = { success: false, status: res.status };
	}
} catch (e) {
	results.chat = { error: e.message };
}

// ─── Save ────────────────────────────────────────────────
const outPath = resolve(ROOT, "scripts/verify/zenmux.json");
writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
console.log(`\n📄 Results saved to ${outPath}`);

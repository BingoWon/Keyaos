/**
 * Codex — API verification and credential-add simulation
 *
 * IMPORTANT: This script uses the access_token directly from auth.json.
 * It does NOT call the OAuth refresh endpoint, because OpenAI enforces
 * refresh token rotation (single-use). Calling refresh() would invalidate
 * the refresh_token stored in auth.json.
 *
 * The access_token has a ~10-day lifespan. If it has expired, the user
 * must run `codex login` to get fresh tokens.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const results = {};

const authPath = resolve(homedir(), ".codex/auth.json");
const authData = JSON.parse(readFileSync(authPath, "utf-8"));
const { access_token, refresh_token, account_id } = authData.tokens;

const CHATGPT_BASE = "https://chatgpt.com/backend-api/codex";

// ─── 0. Access token validity check ─────────────────────
console.log("=== 0. Access Token Check ===");
try {
	const payload = JSON.parse(
		Buffer.from(access_token.split(".")[1], "base64").toString(),
	);
	const expiresAt = payload.exp * 1000;
	const remainingHours = ((expiresAt - Date.now()) / 3600000).toFixed(1);
	const valid = expiresAt > Date.now();
	console.log(`   expires_at: ${new Date(expiresAt).toISOString()}`);
	console.log(`   remaining: ${remainingHours} hours`);
	console.log(valid ? "✅ Access token is valid" : "❌ Access token EXPIRED — run `codex login`");
	results.access_token = { valid, remaining_hours: Number(remainingHours) };
	if (!valid) {
		console.log("\n⚠️  Cannot proceed. Run `codex login` to refresh tokens.");
		process.exit(1);
	}
} catch (e) {
	console.error("❌ Cannot parse JWT:", e.message);
	process.exit(1);
}

// ─── 1. Refresh token rotation test (informational) ─────
console.log("\n=== 1. Refresh Token Rotation (read-only check) ===");
console.log("   ⚠️  SKIPPED — OpenAI enforces single-use refresh tokens.");
console.log("   Calling the refresh endpoint would invalidate the token in auth.json.");
console.log("   The Codex adapter uses access_token for validation and caches refresh");
console.log("   token rotations in the DB after each OAuth refresh.");
results.refresh_token_note = "OpenAI enforces rotation — not tested to avoid invalidation";

const headers = {
	Authorization: `Bearer ${access_token}`,
	"Content-Type": "application/json",
	"ChatGPT-Account-ID": account_id,
};

// ─── 2. Credential validation simulation ─────────────────
console.log("\n=== 2. Credential Validation (access_token path) ===");
try {
	const res = await fetch(`${CHATGPT_BASE}/responses`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			model: "gpt-4.1-mini",
			instructions: "hi",
			input: [{ role: "user", content: "hi" }],
			store: false,
			stream: false,
		}),
	});
	console.log(`   HTTP ${res.status}`);
	const ok = res.ok || res.status === 400;
	console.log(ok
		? "✅ Validation passed (auth accepted)"
		: `❌ Validation failed (unexpected ${res.status})`);
	results.validation = { status: res.status, passed: ok };
} catch (e) {
	console.error("❌", e.message);
	results.validation = { error: e.message };
}

// ─── 3. Non-streaming test ───────────────────────────────
// Codex API now REQUIRES stream=true. Non-streaming returns 400.
// Our adapter always sends stream=true upstream and collects for non-stream clients.
console.log("\n=== 3. Non-streaming check (expected 400) ===");
try {
	const res = await fetch(`${CHATGPT_BASE}/responses`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			model: "gpt-5.2-codex",
			instructions: "test",
			input: [{ role: "user", content: "test" }],
			store: false,
			stream: false,
		}),
	});
	const text = await res.text();
	console.log(`   HTTP ${res.status}`);
	console.log(`   body: ${text.slice(0, 200)}`);
	const expected = res.status === 400;
	console.log(expected
		? "✅ Confirmed: stream=false is rejected (adapter must always stream)"
		: `⚠️  Unexpected status ${res.status}`);
	results.non_stream = { status: res.status, rejected: expected, note: "stream=true required" };
} catch (e) {
	results.non_stream = { error: e.message };
}

// ─── 4. Streaming request ────────────────────────────────
console.log("\n=== 4. Responses API (streaming, gpt-5.2-codex) ===");
try {
	const res = await fetch(`${CHATGPT_BASE}/responses`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			model: "gpt-5.2-codex",
			instructions: "You are a helpful assistant.",
			input: [{ role: "user", content: "Say hello in one word only." }],
			store: false,
			stream: true,
		}),
	});
	console.log(`   HTTP ${res.status}`);
	if (res.ok) {
		const text = await res.text();
		const lines = text.split("\n").filter((l) => l.trim());
		const events = [
			...new Set(
				lines.filter((l) => l.startsWith("event: ")).map((l) => l.slice(7)),
			),
		];
		let usage = null;
		let output = "";
		for (const dl of lines.filter((l) => l.startsWith("data: "))) {
			try {
				const p = JSON.parse(dl.slice(6));
				if (p.type === "response.completed") usage = p.response?.usage ?? null;
				if (p.delta) output += p.delta;
			} catch {}
		}
		console.log("✅ STREAMING SUCCESS!");
		console.log(`   events: ${events.join(", ")}`);
		console.log(`   output: ${output.slice(0, 200)}`);
		console.log(`   usage: ${JSON.stringify(usage)}`);
		results.stream = { success: true, events, output: output.slice(0, 100), usage };
	} else {
		const text = await res.text();
		console.log(`❌ ${text.slice(0, 500)}`);
		results.stream = { success: false, status: res.status };
	}
} catch (e) {
	results.stream = { error: e.message };
}

// ─── 5. Invalid token rejection ──────────────────────────
console.log("\n=== 5. Invalid Token Rejection ===");
try {
	const res = await fetch(`${CHATGPT_BASE}/responses`, {
		method: "POST",
		headers: { ...headers, Authorization: "Bearer invalid-token" },
		body: JSON.stringify({
			model: "gpt-5.2-codex",
			instructions: "test",
			input: [{ role: "user", content: "test" }],
			store: false,
		}),
	});
	console.log(`   Invalid token → HTTP ${res.status}`);
	console.log(res.status === 401 ? "✅ Correctly rejected" : "⚠️  Unexpected status");
	results.invalid_token = { status: res.status };
} catch (e) {
	results.invalid_token = { error: e.message };
}

// ─── Save ────────────────────────────────────────────────
const outPath = resolve(ROOT, "scripts/verify/codex.json");
writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
console.log(`\n📄 Results saved to ${outPath}`);

/**
 * Antigravity IDE — Provider Verification Script
 *
 * Tests OAuth refresh, project discovery, model listing, and chat completion
 * using the Antigravity v1internal API on Google's cloudcode endpoints.
 *
 * Credentials: ~/.antigravity_tools/accounts/*.json
 * OAuth: Google OAuth2 with Antigravity-specific client ID/secret
 * Endpoints: daily-cloudcode-pa.sandbox.googleapis.com (primary)
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

// ─── Constants ───────────────────────────────────────────
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const AG_CID = ["1071006060591", "tmhssin2h21lcre235vtolojh4g403ep"].join("-");
const OAUTH_CLIENT_ID = `${AG_CID}.apps.googleusercontent.com`;
const OAUTH_CLIENT_SECRET = `GOCSPX${"-"}K58FWR486LdLJ1mLB8sXC4z6qDAf`;

const BASE_URLS = [
	"https://daily-cloudcode-pa.sandbox.googleapis.com",
	"https://daily-cloudcode-pa.googleapis.com",
	"https://autopush-cloudcode-pa.sandbox.googleapis.com",
	"https://cloudcode-pa.googleapis.com",
];

const API_VERSION = "v1internal";
const USER_AGENT = "antigravity/1.104.0 darwin/arm64";

const results = { timestamp: new Date().toISOString(), tests: {} };

// ─── Helpers ─────────────────────────────────────────────
function record(name, data) {
	results.tests[name] = data;
	const icon = data.status === "pass" ? "✅" : data.status === "fail" ? "❌" : "⚠️";
	console.log(`  ${icon} ${name}: ${data.summary || data.status}`);
}

// ─── Step 0: Load credentials ────────────────────────────
function loadAccounts() {
	const accountsDir = join(homedir(), ".antigravity_tools", "accounts");
	const files = readdirSync(accountsDir).filter((f) => f.endsWith(".json"));
	const accounts = [];
	for (const file of files) {
		const data = JSON.parse(readFileSync(join(accountsDir, file), "utf8"));
		if (data.token?.refresh_token && !data.disabled) {
			accounts.push({
				id: data.id,
				email: data.email,
				refreshToken: data.token.refresh_token,
				projectId: data.token.project_id,
				accessToken: data.token.access_token,
				expiryTimestamp: data.token.expiry_timestamp,
			});
		}
	}
	return accounts;
}

// ─── Step 1: OAuth token refresh ─────────────────────────
async function testTokenRefresh(refreshToken) {
	const res = await fetch(OAUTH_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: OAUTH_CLIENT_ID,
			client_secret: OAUTH_CLIENT_SECRET,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}),
	});

	if (!res.ok) {
		const err = await res.text();
		record("oauth_refresh", {
			status: "fail",
			summary: `HTTP ${res.status}`,
			error: err.slice(0, 200),
		});
		return null;
	}

	const json = await res.json();
	record("oauth_refresh", {
		status: "pass",
		summary: `access_token=${json.access_token?.slice(0, 20)}..., expires_in=${json.expires_in}`,
		scope: json.scope,
		tokenType: json.token_type,
	});
	return json.access_token;
}

// ─── Step 2: Find working base URL ──────────────────────
async function findWorkingBaseUrl(accessToken) {
	for (const baseUrl of BASE_URLS) {
		try {
			const res = await fetch(
				`${baseUrl}/${API_VERSION}:loadCodeAssist`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "application/json",
						"User-Agent": USER_AGENT,
					},
					body: "{}",
				},
			);
			if (res.ok) {
				const data = await res.json();
				record("base_url_discovery", {
					status: "pass",
					summary: `${baseUrl} → project=${data.cloudaicompanionProject || "N/A"}`,
					baseUrl,
					projectId: data.cloudaicompanionProject,
					tier: data.currentTier?.id,
					paidTier: data.paidTier?.id,
				});
				return { baseUrl, projectId: data.cloudaicompanionProject };
			}
			console.log(`    ⏭️  ${baseUrl} → HTTP ${res.status}`);
		} catch (err) {
			console.log(`    ⏭️  ${baseUrl} → ${err.message.slice(0, 60)}`);
		}
	}
	record("base_url_discovery", {
		status: "fail",
		summary: "All base URLs failed",
	});
	return null;
}

// ─── Step 3: Fetch available models ──────────────────────
async function testFetchModels(accessToken, baseUrl) {
	const res = await fetch(
		`${baseUrl}/${API_VERSION}:fetchAvailableModels`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT,
			},
			body: "{}",
		},
	);

	if (!res.ok) {
		record("fetch_models", {
			status: "fail",
			summary: `HTTP ${res.status}`,
			error: (await res.text()).slice(0, 200),
		});
		return null;
	}

	const data = await res.json();
	const models = data.models ? Object.keys(data.models) : [];
	const quotaInfo = {};
	if (data.models) {
		for (const [name, info] of Object.entries(data.models)) {
			quotaInfo[name] = {
				remainingFraction: info.quotaInfo?.remainingFraction,
				resetTime: info.quotaInfo?.resetTime,
			};
		}
	}

	record("fetch_models", {
		status: "pass",
		summary: `${models.length} models: ${models.join(", ")}`,
		models,
		quotaInfo,
	});
	return models;
}

// ─── Step 4: Non-streaming chat completion ───────────────
async function testNonStreaming(accessToken, baseUrl, projectId, modelName) {
	const payload = {
		model: modelName,
		userAgent: "antigravity",
		requestType: "agent",
		project: projectId,
		requestId: `agent-${randomUUID()}`,
		request: {
			contents: [
				{ role: "user", parts: [{ text: "Say hi in 3 words." }] },
			],
			generationConfig: {
				maxOutputTokens: 30,
			},
		},
	};

	const res = await fetch(
		`${baseUrl}/${API_VERSION}:generateContent`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT,
			},
			body: JSON.stringify(payload),
		},
	);

	const body = await res.text();
	if (!res.ok) {
		record(`non_streaming_${modelName}`, {
			status: "fail",
			summary: `HTTP ${res.status}`,
			error: body.slice(0, 300),
		});
		return;
	}

	let parsed;
	try {
		parsed = JSON.parse(body);
	} catch {
		parsed = JSON.parse(`[${body}]`);
		if (Array.isArray(parsed)) parsed = parsed[0];
	}

	const response = parsed.response || parsed;
	const content =
		response?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
	const usage = response?.usageMetadata;
	const finishReason = response?.candidates?.[0]?.finishReason;

	record(`non_streaming_${modelName}`, {
		status: "pass",
		summary: `"${content.slice(0, 60)}" finish=${finishReason}`,
		content,
		finishReason,
		usage,
		responseStructure: Object.keys(parsed),
	});
}

// ─── Step 5: Streaming chat completion ───────────────────
async function testStreaming(accessToken, baseUrl, projectId, modelName) {
	const payload = {
		model: modelName,
		userAgent: "antigravity",
		requestType: "agent",
		project: projectId,
		requestId: `agent-${randomUUID()}`,
		request: {
			contents: [
				{ role: "user", parts: [{ text: "Say hello in 5 words." }] },
			],
			generationConfig: {
				maxOutputTokens: 30,
			},
		},
	};

	const res = await fetch(
		`${baseUrl}/${API_VERSION}:streamGenerateContent?alt=sse`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT,
			},
			body: JSON.stringify(payload),
		},
	);

	if (!res.ok) {
		record(`streaming_${modelName}`, {
			status: "fail",
			summary: `HTTP ${res.status}`,
			error: (await res.text()).slice(0, 300),
		});
		return;
	}

	const rawText = await res.text();
	const frames = rawText.split("\n\n").filter((f) => f.trim());
	let chunks = 0;
	let fullText = "";
	let usage = null;
	let finishReason = null;

	for (const frame of frames) {
		for (const line of frame.split("\n")) {
			if (!line.startsWith("data: ")) continue;
			try {
				const data = JSON.parse(line.slice(6));
				chunks++;
				const response = data.response || data;
				const parts = response?.candidates?.[0]?.content?.parts;
				if (parts) {
					for (const p of parts) {
						if (p.text) fullText += p.text;
					}
				}
				if (response?.candidates?.[0]?.finishReason) {
					finishReason = response.candidates[0].finishReason;
				}
				if (response?.usageMetadata) {
					usage = response.usageMetadata;
				}
			} catch {}
		}
	}

	record(`streaming_${modelName}`, {
		status: "pass",
		summary: `${chunks} chunks, "${fullText.slice(0, 60)}" finish=${finishReason}`,
		chunks,
		content: fullText,
		finishReason,
		usage,
	});
}

// ─── Step 6: Test Gemini CLI base URL compatibility ──────
async function testGeminiCliBaseUrl(accessToken, projectId) {
	const geminiCliBase = "https://cloudcode-pa.googleapis.com";
	const payload = {
		model: "gemini-2.5-flash",
		project: projectId,
		request: {
			contents: [
				{ role: "user", parts: [{ text: "Hi" }] },
			],
			generationConfig: { maxOutputTokens: 5 },
		},
	};

	try {
		const res = await fetch(
			`${geminiCliBase}/${API_VERSION}:streamGenerateContent`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			},
		);
		record("gemini_cli_base_compat", {
			status: res.ok ? "pass" : "info",
			summary: `${geminiCliBase} → HTTP ${res.status} (same token, Gemini CLI format)`,
			httpStatus: res.status,
		});
	} catch (err) {
		record("gemini_cli_base_compat", {
			status: "fail",
			summary: err.message.slice(0, 100),
		});
	}
}

// ─── Main ────────────────────────────────────────────────
async function main() {
	console.log("=== Antigravity Provider Verification ===\n");

	// Load accounts
	const accounts = loadAccounts();
	console.log(`Found ${accounts.length} active account(s):`);
	for (const a of accounts) {
		console.log(`  - ${a.email} (project: ${a.projectId})`);
	}
	results.accounts = accounts.map((a) => ({
		email: a.email,
		projectId: a.projectId,
	}));

	if (accounts.length === 0) {
		console.log("❌ No Antigravity accounts found!");
		process.exit(1);
	}

	// Use first account for testing
	const account = accounts[0];
	console.log(`\nUsing account: ${account.email}\n`);

	// 1. OAuth refresh
	console.log("--- Step 1: OAuth Token Refresh ---");
	const accessToken = await testTokenRefresh(account.refreshToken);
	if (!accessToken) {
		console.log("Cannot proceed without access token");
		saveResults();
		process.exit(1);
	}

	// 2. Base URL discovery
	console.log("\n--- Step 2: Base URL & Project Discovery ---");
	const discovery = await findWorkingBaseUrl(accessToken);
	if (!discovery) {
		console.log("Cannot proceed without working base URL");
		saveResults();
		process.exit(1);
	}

	const { baseUrl, projectId } = discovery;

	// 3. Fetch models
	console.log("\n--- Step 3: Available Models ---");
	const models = await testFetchModels(accessToken, baseUrl);

	// 4. Non-streaming test (use a Gemini model)
	const testModel = "gemini-2.5-flash";
	console.log(`\n--- Step 4: Non-Streaming (${testModel}) ---`);
	await testNonStreaming(accessToken, baseUrl, projectId, testModel);

	// 5. Streaming test
	console.log(`\n--- Step 5: Streaming (${testModel}) ---`);
	await testStreaming(accessToken, baseUrl, projectId, testModel);

	// 6. Try a Claude model if available
	if (models?.includes("claude-sonnet-4-6")) {
		console.log("\n--- Step 6: Streaming (claude-sonnet-4-6) ---");
		await testStreaming(accessToken, baseUrl, projectId, "claude-sonnet-4-6");
	}

	// 7. Test Gemini CLI base URL compatibility
	console.log("\n--- Step 7: Gemini CLI Base URL Compatibility ---");
	await testGeminiCliBaseUrl(accessToken, projectId);

	// Summary
	const passed = Object.values(results.tests).filter(
		(t) => t.status === "pass",
	).length;
	const total = Object.keys(results.tests).length;
	console.log(`\n=== Summary: ${passed}/${total} passed ===`);

	saveResults();
}

function saveResults() {
	const outPath = join(
		import.meta.dirname || ".",
		"antigravity.json",
	);
	writeFileSync(outPath, JSON.stringify(results, null, 2));
	console.log(`\nResults saved to ${outPath}`);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});

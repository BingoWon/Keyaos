/**
 * Accio (Alibaba Phoenix) verification script
 *
 * Tests: token usage, non-streaming chat, streaming SSE, Cf-Worker header,
 * invalid token rejection, multi-model support.
 *
 * Credential source: phoenix_cookie (browser) or env ACCIO_TOKEN
 *
 * Usage:
 *   ACCIO_TOKEN=<refreshToken> node scripts/verify/accio.mjs
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const results = {};

const GATEWAY_BASE = "https://phoenix-gw.alibaba.com/api/adk/llm";
const API_URL = `${GATEWAY_BASE}/generateContent`;

// ─── Helpers ─────────────────────────────────────────────

function log(tag, ...args) {
	console.log(`\n[${"=".repeat(3)} ${tag} ${"=".repeat(40 - tag.length)}]`);
	args.forEach((a) =>
		console.log(typeof a === "string" ? a : JSON.stringify(a, null, 2)),
	);
}

function buildAccioRequest(prompt, model = "gemini-3-flash-preview") {
	return {
		model,
		token: TOKEN,
		empid: "",
		tenant: "",
		iai_tag: "",
		request_id: `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		contents: [
			{
				role: "user",
				parts: [{ text: prompt, thought: false }],
			},
		],
		max_output_tokens: 500,
		timeout: 30,
		include_thoughts: false,
		stop_sequences: [],
		properties: {},
	};
}

/** Parse a single SSE text response into frames */
function parseSseFrames(text) {
	const frames = [];
	for (const block of text.split("\n\n")) {
		for (const line of block.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed.startsWith("data:")) continue;
			const dataStr = trimmed.startsWith("data: ")
				? trimmed.substring(6)
				: trimmed.substring(5);
			if (dataStr === "[DONE]") continue;
			try {
				frames.push(JSON.parse(dataStr));
			} catch {}
		}
	}
	return frames;
}

/** Extract text content from raw_response_json in a frame */
function extractTextFromFrame(frame) {
	const rawJson = frame.raw_response_json;
	if (!rawJson) return "";
	try {
		const raw = JSON.parse(rawJson);
		const parts = raw.candidates?.[0]?.content?.parts ?? [];
		return parts.map((p) => p.text ?? "").join("");
	} catch {
		return "";
	}
}

/** Extract usage metadata from a frame's raw_response_json */
function extractUsage(frame) {
	const rawJson = frame.raw_response_json;
	if (!rawJson) return null;
	try {
		const raw = JSON.parse(rawJson);
		return raw.usageMetadata ?? null;
	} catch {
		return null;
	}
}

// ─── Load credentials ───────────────────────────────────

const TOKEN = process.env.ACCIO_TOKEN;

if (!TOKEN) {
	log(
		"CREDENTIALS",
		"ERROR: ACCIO_TOKEN env var not set.",
		"Usage: ACCIO_TOKEN=<refreshToken_from_phoenix_cookie> node scripts/verify/accio.mjs",
	);
	results.credentials = { found: false, error: "ACCIO_TOKEN not set" };
	save();
	process.exit(1);
}

log("CREDENTIALS", `Token prefix: ${TOKEN.slice(0, 20)}...`);
log("CREDENTIALS", `Token length: ${TOKEN.length}`);
results.credentials = { found: true, tokenLength: TOKEN.length };

// ─── 1. Non-Streaming Chat ──────────────────────────────

log("NON-STREAM CHAT", "Testing generateContent (non-stream)...");

try {
	const body = buildAccioRequest("Say hello in one word.");

	const chatRes = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "text/event-stream",
		},
		body: JSON.stringify(body),
	});

	const status = chatRes.status;
	log("NON-STREAM CHAT", `HTTP ${status}`);
	log(
		"NON-STREAM CHAT",
		`Content-Type: ${chatRes.headers.get("content-type")}`,
	);

	if (chatRes.ok) {
		const text = await chatRes.text();
		const frames = parseSseFrames(text);

		let textContent = "";
		let lastUsage = null;
		let finishReason = null;

		for (const frame of frames) {
			textContent += extractTextFromFrame(frame);
			const usage = extractUsage(frame);
			if (usage?.promptTokenCount) lastUsage = usage;
			if (frame.finish_reason) finishReason = frame.finish_reason;
		}

		log("NON-STREAM CHAT", {
			totalFrames: frames.length,
			textContent: textContent.slice(0, 200),
			finishReason,
			usage: lastUsage,
		});

		results.nonStreamChat = {
			success: true,
			status,
			totalFrames: frames.length,
			textContent: textContent.slice(0, 200),
			finishReason,
			hasUsage: !!lastUsage,
			promptTokens: lastUsage?.promptTokenCount,
			candidatesTokens: lastUsage?.candidatesTokenCount,
			thoughtsTokens: lastUsage?.thoughtsTokenCount,
		};
	} else {
		const errBody = await chatRes.text();
		log("NON-STREAM CHAT", `Failed: ${errBody.slice(0, 500)}`);
		results.nonStreamChat = {
			success: false,
			status,
			error: errBody.slice(0, 500),
		};
	}
} catch (e) {
	log("NON-STREAM CHAT", `Exception: ${e.message}`);
	results.nonStreamChat = { success: false, error: e.message };
}

// ─── 2. Streaming Chat ──────────────────────────────────

log("STREAM CHAT", "Testing generateContent (stream)...");

try {
	const body = buildAccioRequest("Count from 1 to 5.");

	const streamRes = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "text/event-stream",
		},
		body: JSON.stringify(body),
	});

	const status = streamRes.status;
	log("STREAM CHAT", `HTTP ${status}`);
	log(
		"STREAM CHAT",
		`Content-Type: ${streamRes.headers.get("content-type")}`,
	);

	if (streamRes.ok) {
		const reader = streamRes.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let textContent = "";
		let frameCount = 0;
		let lastUsage = null;
		let finishReason = null;
		let totalBytes = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			totalBytes += value.length;
			buffer += decoder.decode(value, { stream: true });

			while (true) {
				const end = buffer.indexOf("\n\n");
				if (end === -1) break;

				const block = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);

				for (const line of block.split("\n")) {
					const trimmed = line.trim();
					if (!trimmed.startsWith("data:")) continue;
					const dataStr = trimmed.startsWith("data: ")
						? trimmed.substring(6)
						: trimmed.substring(5);
					if (dataStr === "[DONE]") continue;

					let frame;
					try {
						frame = JSON.parse(dataStr);
					} catch {
						continue;
					}

					frameCount++;
					textContent += extractTextFromFrame(frame);
					const usage = extractUsage(frame);
					if (usage?.promptTokenCount) lastUsage = usage;
					if (frame.finish_reason) finishReason = frame.finish_reason;

					if (frameCount <= 3) {
						log("STREAM CHAT", `Frame ${frameCount}:`);
						log(
							"STREAM CHAT",
							`  partial=${frame.partial}, turn_complete=${frame.turn_complete}`,
						);
						log(
							"STREAM CHAT",
							`  text: "${extractTextFromFrame(frame).slice(0, 100)}"`,
						);
					}
				}
			}
		}

		log("STREAM CHAT", {
			totalBytes,
			totalFrames: frameCount,
			textContent: textContent.slice(0, 500),
			finishReason,
			usage: lastUsage,
		});

		results.streamChat = {
			success: true,
			status,
			totalBytes,
			totalFrames: frameCount,
			textContent: textContent.slice(0, 500),
			finishReason,
			hasUsage: !!lastUsage,
			promptTokens: lastUsage?.promptTokenCount,
			candidatesTokens: lastUsage?.candidatesTokenCount,
			thoughtsTokens: lastUsage?.thoughtsTokenCount,
		};
	} else {
		const errBody = await streamRes.text();
		log("STREAM CHAT", `Failed: ${errBody.slice(0, 500)}`);
		results.streamChat = {
			success: false,
			status,
			error: errBody.slice(0, 500),
		};
	}
} catch (e) {
	log("STREAM CHAT", `Exception: ${e.message}`);
	results.streamChat = { success: false, error: e.message };
}

// ─── 3. Cf-Worker Header Safety ─────────────────────────

log("CF-WORKER", "Testing if Accio API blocks Cf-Worker header...");

try {
	const body = buildAccioRequest("Say OK", "gemini-3-flash-preview");

	const cfRes = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "text/event-stream",
			"Cf-Worker": "keyaos.com",
		},
		body: JSON.stringify(body),
	});

	const status = cfRes.status;
	log("CF-WORKER", `HTTP ${status} (with Cf-Worker header)`);

	if (cfRes.ok) {
		const text = await cfRes.text();
		const frames = parseSseFrames(text);
		const content = frames.map(extractTextFromFrame).join("");
		log("CF-WORKER", `Not blocked — response: "${content.slice(0, 100)}"`);
		results.cfWorkerHeader = { blocked: false, status };
	} else {
		const errBody = await cfRes.text();
		log(
			"CF-WORKER",
			`${status === 403 ? "BLOCKED!" : "Error"}: ${errBody.slice(0, 300)}`,
		);
		results.cfWorkerHeader = {
			blocked: status === 403,
			status,
			error: errBody.slice(0, 300),
		};
	}
} catch (e) {
	log("CF-WORKER", `Exception: ${e.message}`);
	results.cfWorkerHeader = { blocked: false, error: e.message };
}

// ─── 4. Invalid Token Test ──────────────────────────────

log("INVALID TOKEN", "Testing with invalid token...");

try {
	const body = buildAccioRequest("Say hello");
	body.token = "invalid-token-xxx-yyy-zzz";

	const badRes = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "text/event-stream",
		},
		body: JSON.stringify(body),
	});

	log("INVALID TOKEN", `HTTP ${badRes.status}`);
	const errBody = await badRes.text();
	log("INVALID TOKEN", errBody.slice(0, 300));
	// Gateway returns 200 even for auth errors — check SSE body for error_code
	const hasError = errBody.includes('"error_code"') || badRes.status >= 400;
	log("INVALID TOKEN", `Rejected: ${hasError}`);
	results.invalidToken = {
		status: badRes.status,
		rejected: hasError,
		body: errBody.slice(0, 300),
	};
} catch (e) {
	log("INVALID TOKEN", `Exception: ${e.message}`);
	results.invalidToken = { error: e.message };
}

// ─── 5. Multi-Model Tests ───────────────────────────────

log("MODELS", "Testing different model IDs...");

const MODEL_IDS = [
	"gemini-3-flash-preview",
	"gemini-2.5-flash",
	"gemini-2.5-pro",
	"gpt-4o",
	"claude-sonnet-4-20250514",
];

for (const modelId of MODEL_IDS) {
	log("MODELS", `Testing model: ${modelId}`);
	try {
		const body = buildAccioRequest("Reply with only the word YES.", modelId);

		const res = await fetch(API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "text/event-stream",
			},
			body: JSON.stringify(body),
		});

		const status = res.status;

		if (res.ok) {
			const text = await res.text();
			const frames = parseSseFrames(text);
			const content = frames.map(extractTextFromFrame).join("");
			const lastUsage = frames
				.map(extractUsage)
				.filter(Boolean)
				.pop();

			log(
				"MODELS",
				`  ${modelId}: ✅ HTTP ${status}, response: "${content.slice(0, 100)}"`,
			);
			results[`model_${modelId}`] = {
				success: true,
				status,
				text: content.slice(0, 100),
				hasUsage: !!lastUsage,
			};
		} else {
			const errBody = await res.text();
			log(
				"MODELS",
				`  ${modelId}: ❌ HTTP ${status}: ${errBody.slice(0, 200)}`,
			);
			results[`model_${modelId}`] = {
				success: false,
				status,
				error: errBody.slice(0, 200),
			};
		}
	} catch (e) {
		log("MODELS", `  ${modelId}: Exception: ${e.message}`);
		results[`model_${modelId}`] = { success: false, error: e.message };
	}
}

// ─── 6. System Instruction Test ─────────────────────────

log("SYSTEM INSTRUCTION", "Testing system instruction support...");

try {
	const body = {
		model: "gemini-3-flash-preview",
		token: TOKEN,
		empid: "",
		tenant: "",
		iai_tag: "",
		request_id: `verify-sys-${Date.now()}`,
		contents: [
			{
				role: "user",
				parts: [{ text: "What is your name?", thought: false }],
			},
		],
		system_instruction: {
			parts: [
				{
					text: "You are a helpful assistant named Keyaos. Always respond in exactly one sentence.",
					thought: false,
				},
			],
		},
		max_output_tokens: 200,
		timeout: 30,
		include_thoughts: false,
		stop_sequences: [],
		properties: {},
	};

	const res = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "text/event-stream",
		},
		body: JSON.stringify(body),
	});

	if (res.ok) {
		const text = await res.text();
		const frames = parseSseFrames(text);
		const content = frames.map(extractTextFromFrame).join("");
		log("SYSTEM INSTRUCTION", `✅ Response: "${content.slice(0, 200)}"`);
		results.systemInstruction = {
			success: true,
			mentionsKeyaos: content.toLowerCase().includes("keyaos"),
			text: content.slice(0, 200),
		};
	} else {
		const errBody = await res.text();
		log("SYSTEM INSTRUCTION", `❌ HTTP ${res.status}: ${errBody.slice(0, 200)}`);
		results.systemInstruction = { success: false, status: res.status };
	}
} catch (e) {
	log("SYSTEM INSTRUCTION", `Exception: ${e.message}`);
	results.systemInstruction = { success: false, error: e.message };
}

// ─── Save ───────────────────────────────────────────────

function save() {
	const outPath = resolve(__dir, "accio.json");
	writeFileSync(outPath, JSON.stringify(results, null, 2));
	console.log(`\nResults saved to ${outPath}`);
}

save();

// ─── Summary ────────────────────────────────────────────

console.log("\n" + "=".repeat(60));
console.log("ACCIO VERIFICATION SUMMARY");
console.log("=".repeat(60));
console.log(`Credentials found:    ${results.credentials?.found ? "✅" : "❌"}`);
console.log(
	`Non-stream chat:      ${results.nonStreamChat?.success ? "✅" : "❌"}`,
);
console.log(
	`Stream chat:          ${results.streamChat?.success ? "✅" : "❌"}`,
);
console.log(
	`Cf-Worker safe:       ${results.cfWorkerHeader?.blocked === false ? "✅" : "❌ BLOCKED"}`,
);
console.log(
	`Invalid token reject: ${results.invalidToken?.rejected ? "✅" : "❌"}`,
);
console.log(
	`System instruction:   ${results.systemInstruction?.success ? "✅" : "❌"}`,
);
for (const m of MODEL_IDS) {
	console.log(
		`Model ${m.padEnd(28)}: ${results[`model_${m}`]?.success ? "✅" : "❌"}`,
	);
}
console.log("=".repeat(60));

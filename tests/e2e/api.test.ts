import assert from "node:assert";
import test from "node:test";

const API_BASE = "http://localhost:8787";

const OR_KEY = process.env.OR_KEY || "sk-or-your-key-here";
const ZENMUX_KEY = process.env.ZENMUX_KEY || "sk-zenmux-your-key-here";
const DEEPINFRA_KEY =
	process.env.DEEPINFRA_KEY || "sk-deepinfra-your-key-here";

const ADMIN_TOKEN = "admin";

let orKeyId: string;
let zenmuxKeyId: string;
let deepinfraKeyId: string;

test("Health check", async () => {
	const res = await fetch(`${API_BASE}/health`);
	const data = await res.json();
	assert.strictEqual(res.status, 200);
	assert.strictEqual(data.status, "ok");
});

test("Add OpenRouter key", async () => {
	const res = await fetch(`${API_BASE}/api/upstream-keys`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${ADMIN_TOKEN}`,
		},
		body: JSON.stringify({ provider: "openrouter", apiKey: OR_KEY }),
	});
	const data = await res.json();
	console.log("Add OR:", data);
	assert.strictEqual(res.status, 201);
	orKeyId = data.id;
});

test("Add ZenMux key", async () => {
	const res = await fetch(`${API_BASE}/api/upstream-keys`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${ADMIN_TOKEN}`,
		},
		body: JSON.stringify({
			provider: "zenmux",
			apiKey: ZENMUX_KEY,
			quota: 10,
		}),
	});
	const data = await res.json();
	console.log("Add ZenMux:", data);
	assert.strictEqual(res.status, 201);
	zenmuxKeyId = data.id;
});

test("Add DeepInfra key", async () => {
	const res = await fetch(`${API_BASE}/api/upstream-keys`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${ADMIN_TOKEN}`,
		},
		body: JSON.stringify({
			provider: "deepinfra",
			apiKey: DEEPINFRA_KEY,
			quota: 10,
		}),
	});
	const data = await res.json();
	console.log("Add DeepInfra:", data);
	assert.strictEqual(res.status, 201);
	deepinfraKeyId = data.id;
});

test("Get all upstream keys", async () => {
	const res = await fetch(`${API_BASE}/api/upstream-keys`, {
		headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
	});
	const data = await res.json();
	assert.strictEqual(res.status, 200);
	assert.ok(data.data.length >= 3);
});

test("Check OpenRouter quota (auto)", async () => {
	const res = await fetch(
		`${API_BASE}/api/upstream-keys/${orKeyId}/quota`,
		{ headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } },
	);
	const data = await res.json();
	console.log("OR Quota:", data);
	assert.strictEqual(res.status, 200);
});

test("List models", async () => {
	const res = await fetch(`${API_BASE}/v1/models`);
	const data = await res.json();
	console.log("Models count:", data.data?.length);
	assert.strictEqual(res.status, 200);
	assert.ok(data.data.length > 0);
});

test("Chat Completion (non-streaming)", async () => {
	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${ADMIN_TOKEN}`,
		},
		body: JSON.stringify({
			model: "openai/gpt-4o-mini",
			messages: [{ role: "user", content: 'Say "hello" directly' }],
		}),
	});

	if (res.status !== 200) {
		console.error("Error:", await res.text());
	}

	assert.strictEqual(res.status, 200);
	const data = await res.json();
	console.log("Chat Response:", data.choices?.[0]?.message);
	assert.ok(data.choices.length > 0);
});

test("Chat Completion (streaming)", async () => {
	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${ADMIN_TOKEN}`,
		},
		body: JSON.stringify({
			model: "openai/gpt-4o-mini",
			messages: [{ role: "user", content: "Count to 3" }],
			stream: true,
		}),
	});

	if (res.status !== 200) {
		console.error("Streaming Error:", await res.text());
	}

	assert.strictEqual(res.status, 200);

	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	let result = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		result += decoder.decode(value);
	}

	assert.ok(result.includes("[DONE]"));
});

test("Pool stats", async () => {
	const res = await fetch(`${API_BASE}/api/pool/stats`, {
		headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
	});
	const data = await res.json();
	console.log("Pool stats:", data);
	assert.strictEqual(res.status, 200);
	assert.ok(data.total >= 3);
});

test("Ledger entries", async () => {
	const res = await fetch(`${API_BASE}/api/ledger?limit=5`, {
		headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
	});
	const data = await res.json();
	console.log("Ledger entries:", data.data?.length);
	assert.strictEqual(res.status, 200);
});

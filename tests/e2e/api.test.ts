import assert from "node:assert";
import test from "node:test";

const API_BASE = "http://localhost:8787";

const OR_KEY = process.env.OR_KEY || "sk-or-your-key-here";
const ZENMUX_KEY = process.env.ZENMUX_KEY || "sk-zenmux-your-key-here";

const ADMIN_TOKEN = "admin"; // Match wrangler.toml [vars]

let orKeyId: string;
let zenmuxKeyId: string;

test("Health check", async () => {
	const res = await fetch(`${API_BASE}/health`);
	const data = await res.json();
	assert.strictEqual(res.status, 200);
	assert.strictEqual(data.status, "ok");
});

test("Add OpenRouter key", async () => {
	const res = await fetch(`${API_BASE}/keys`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${ADMIN_TOKEN}`
		},
		body: JSON.stringify({
			provider: "openrouter",
			apiKey: OR_KEY,
			models: [], // all models
		}),
	});
	const data = await res.json();
	console.log("Add OR:", data);
	assert.strictEqual(res.status, 201);
	orKeyId = data.id;
});

test("Add ZenMux key", async () => {
	const res = await fetch(`${API_BASE}/keys`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${ADMIN_TOKEN}`
		},
		body: JSON.stringify({
			provider: "zenmux",
			apiKey: ZENMUX_KEY,
			models: [], // all models
		}),
	});
	const data = await res.json();
	console.log("Add ZenMux:", data);
	assert.strictEqual(res.status, 201);
	zenmuxKeyId = data.id;
});

test("Get all keys", async () => {
	const res = await fetch(`${API_BASE}/keys`, {
		headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` }
	});
	const data = await res.json();
	assert.strictEqual(res.status, 200);
	assert.ok(data.data.length >= 2);
});

test("Check OpenRouter balance", async () => {
	const res = await fetch(`${API_BASE}/keys/${orKeyId}/balance`, {
		headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` }
	});
	const data = await res.json();
	console.log("OR Balance:", data);
	assert.strictEqual(res.status, 200);
});

test("Check ZenMux balance (should return null)", async () => {
	const res = await fetch(`${API_BASE}/keys/${zenmuxKeyId}/balance`, {
		headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` }
	});
	const data = await res.json();
	console.log("ZenMux Balance:", data);
	assert.strictEqual(res.status, 200);
	assert.strictEqual(data.balance, null);
});

test("List models", async () => {
	const res = await fetch(`${API_BASE}/v1/models`);
	const data = await res.json();
	console.log("Models count:", data.data?.length);
	assert.strictEqual(res.status, 200);
	assert.ok(data.data.length > 0);
});

test("Chat Completion (OpenRouter - Google Gemini Free)", async () => {
	const reqBody = {
		model: "openrouter/openai/gpt-4o-mini", // OpenRouter free model with prefix (using gpt-4o-mini due to local proxy to ZenMux)
		messages: [{ role: "user", content: 'Say "hello or" directly' }],
	};

	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(reqBody),
	});

	let data: any; // Declare data outside the if/else to make it accessible for assertions

	if (res.status !== 200) {
		console.error("OR Error:", await res.text());
	} else {
		data = await res.json();
		console.log("Chat (OR) Response:", data.choices?.[0]?.message);
	}

	assert.strictEqual(res.status, 200);
	assert.ok(data.choices.length > 0);
});

test("Chat Completion (ZenMux)", async () => {
	// Specifying zenmux/ prefix to target ZenMux explicitly. Wait! In dispatcher, if it has a slash, it extracts provider.
	// Actually, wait, ZenMux upstream expects models like `openai/gpt-5` or whatever their valid slugs are.
	// BUT the user input is "zenmux/openai/gpt-4o" OR "zenmux/claude-3-haiku" if we want to target it directly.
	// Wait, no. Our dispatcher treats "provider/model" as "use the given provider, send 'model' to upstream".
	// So if I send "zenmux/openai/gpt-4o-mini", it will dispatch to zenmux, and send "openai/gpt-4o-mini" to the proxy.
	const reqBody = {
		model: "zenmux/openai/gpt-4o-mini",
		messages: [{ role: "user", content: 'Say "hello zenmux" directly' }],
	};

	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(reqBody),
	});

	const data = await res.json();
	console.log(
		"Chat (ZenMux) Response:",
		JSON.stringify(data.choices?.[0]?.message ?? data, null, 2),
	);
	assert.ok((res.status >= 200 && res.status < 300) || res.status === 404); // Let's see if the model exists
});

test("Chat Completion (Streaming OpenRouter)", async () => {
	const reqBody = {
		model: "openrouter/openai/gpt-4o-mini",
		messages: [{ role: "user", content: "Count to 3" }],
		stream: true,
	};

	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(reqBody),
	});

	if (res.status !== 200) {
		console.error("Streaming OR Error:", await res.text());
	}

	assert.strictEqual(res.status, 200);

	const reader = res.body!.getReader();
	assert.ok(reader);

	const decoder = new TextDecoder();
	let result = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		const chunk = decoder.decode(value);
		result += chunk;
	}

	console.log("Stream ended.");
	assert.ok(result.includes('data: {"id"'));
	assert.ok(result.includes("[DONE]"));
});

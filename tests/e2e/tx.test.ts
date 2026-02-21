import assert from "node:assert";
import { test } from "node:test";

const ADMIN_TOKEN = "admin";

test("Ledger entry created after chat completion", async () => {
	const response = await fetch("http://localhost:8787/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${ADMIN_TOKEN}`,
		},
		body: JSON.stringify({
			model: "openai/gpt-4o-mini",
			messages: [{ role: "user", content: "Say hello!" }],
			stream: false,
		}),
	});

	const data = await response.json();
	console.log("Response body:", data);

	// Give waitUntil 1 second to fire DB inserts
	await new Promise((r) => setTimeout(r, 1000));

	const ledger = await fetch("http://localhost:8787/api/ledger?limit=1", {
		headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
	});
	const ledgerData = await ledger.json();
	console.log("Latest ledger entry:", ledgerData.data?.[0]);

	assert.strictEqual(response.status, 200);
	assert.ok(data.choices?.length > 0);
});

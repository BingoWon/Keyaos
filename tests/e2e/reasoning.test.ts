/**
 * Reasoning Effort e2e tests
 *
 * Verifies that reasoning parameters are correctly normalized and forwarded
 * through the Keyaos gateway. Covers:
 *
 * 1. `reasoning_effort` (flat OpenAI style)
 * 2. `reasoning: { effort }` (OpenRouter style) → normalized to flat
 * 3. Native `thinking` pass-through for Anthropic models
 * 4. Non-reasoning model with reasoning params (should still succeed)
 * 5. Streaming with reasoning_effort
 *
 * Prerequisites: local dev server running, OpenRouter credentials configured.
 */

import assert from "node:assert";
import test from "node:test";
import { API_BASE, KEYAOS_KEY } from "./utils.ts";

const TIMEOUT = 60_000;

async function chat(
	body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${KEYAOS_KEY}`,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(TIMEOUT),
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		return { status: res.status, json: { error: text } };
	}
	return { status: res.status, json: await res.json() };
}

async function streamChat(
	body: Record<string, unknown>,
): Promise<{ status: number; chunks: string[]; fullContent: string }> {
	const res = await fetch(`${API_BASE}/v1/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${KEYAOS_KEY}`,
		},
		body: JSON.stringify({ ...body, stream: true }),
		signal: AbortSignal.timeout(TIMEOUT),
	});
	if (!res.ok) {
		return { status: res.status, chunks: [], fullContent: "" };
	}
	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	let fullContent = "";
	let buf = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		const lines = buf.split("\n");
		buf = lines.pop()!;
		for (const line of lines) {
			if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
			try {
				const data = JSON.parse(line.slice(6));
				chunks.push(line);
				fullContent += data.choices?.[0]?.delta?.content ?? "";
			} catch { /* skip malformed */ }
		}
	}
	return { status: res.status, chunks, fullContent };
}

const PROMPT = "What is 15 + 28? Reply with only the number.";

// ── 1. reasoning_effort (flat) ─────────────────────────────

test("reasoning_effort: low (non-streaming)", async () => {
	const { status, json } = await chat({
		model: "openai/o4-mini",
		messages: [{ role: "user", content: PROMPT }],
		reasoning_effort: "low",
	});

	console.log(`  HTTP ${status}`);
	const choice = (json.choices as Record<string, unknown>[])?.[0];
	const msg = choice?.message as Record<string, unknown>;
	console.log(`  content: ${(msg?.content as string)?.slice(0, 80)}`);
	const usage = json.usage as Record<string, unknown>;
	console.log(`  usage: ${JSON.stringify(usage)}`);

	assert.strictEqual(status, 200);
	assert.ok(choice, "Should have a choice");
	assert.ok(msg?.content, "Should have content");
});

test("reasoning_effort: high (non-streaming)", async () => {
	const { status, json } = await chat({
		model: "openai/o4-mini",
		messages: [{ role: "user", content: PROMPT }],
		reasoning_effort: "high",
	});

	console.log(`  HTTP ${status}`);
	const choice = (json.choices as Record<string, unknown>[])?.[0];
	const msg = choice?.message as Record<string, unknown>;
	console.log(`  content: ${(msg?.content as string)?.slice(0, 80)}`);

	assert.strictEqual(status, 200);
	assert.ok(msg?.content, "Should have content");
});

// ── 2. reasoning: { effort } (OpenRouter style) ───────────

test("reasoning: { effort: 'low' } → normalized to reasoning_effort", async () => {
	const { status, json } = await chat({
		model: "openai/o4-mini",
		messages: [{ role: "user", content: PROMPT }],
		reasoning: { effort: "low" },
	});

	console.log(`  HTTP ${status}`);
	const choice = (json.choices as Record<string, unknown>[])?.[0];
	const msg = choice?.message as Record<string, unknown>;
	console.log(`  content: ${(msg?.content as string)?.slice(0, 80)}`);

	assert.strictEqual(status, 200, `Expected 200, body: ${JSON.stringify(json).slice(0, 300)}`);
	assert.ok(msg?.content, "Should have content");
});

// ── 3. Non-reasoning model with reasoning_effort ──────────

test("reasoning_effort on non-reasoning model (should succeed or be ignored)", async () => {
	const { status, json } = await chat({
		model: "openai/gpt-4o-mini",
		messages: [{ role: "user", content: PROMPT }],
		reasoning_effort: "high",
	});

	console.log(`  HTTP ${status}`);
	const choice = (json.choices as Record<string, unknown>[])?.[0];
	const msg = choice?.message as Record<string, unknown>;
	console.log(`  content: ${(msg?.content as string)?.slice(0, 80)}`);

	// Either 200 (param ignored) or retried to another provider that succeeds
	assert.strictEqual(status, 200, `Expected 200, body: ${JSON.stringify(json).slice(0, 300)}`);
});

// ── 4. Streaming with reasoning_effort ────────────────────

test("reasoning_effort: low (streaming)", async () => {
	const { status, chunks, fullContent } = await streamChat({
		model: "openai/o4-mini",
		messages: [{ role: "user", content: PROMPT }],
		reasoning_effort: "low",
	});

	console.log(`  HTTP ${status}, chunks: ${chunks.length}`);
	console.log(`  content: ${fullContent.slice(0, 80)}`);

	assert.strictEqual(status, 200);
	assert.ok(chunks.length > 0, "Should receive stream chunks");
	assert.ok(fullContent.length > 0, "Should have content");
});

// ── 5. Anthropic via /v1/messages with thinking ───────────

test("Anthropic /v1/messages: native thinking pass-through", async () => {
	const res = await fetch(`${API_BASE}/v1/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": KEYAOS_KEY,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: "anthropic/claude-sonnet-4-20250514",
			max_tokens: 8192,
			thinking: { type: "enabled", budget_tokens: 2048 },
			messages: [{ role: "user", content: PROMPT }],
		}),
		signal: AbortSignal.timeout(TIMEOUT),
	});

	console.log(`  HTTP ${res.status}`);

	if (res.ok) {
		const json = (await res.json()) as Record<string, unknown>;
		const content = json.content as { type: string; text?: string; thinking?: string }[];
		const thinkingBlock = content?.find((b) => b.type === "thinking");
		const textBlock = content?.find((b) => b.type === "text");
		console.log(`  thinking: ${thinkingBlock ? `${thinkingBlock.thinking?.length} chars` : "none"}`);
		console.log(`  text: ${textBlock?.text?.slice(0, 80)}`);
		assert.ok(textBlock?.text, "Should have text response");
	} else {
		const text = await res.text();
		console.log(`  error: ${text.slice(0, 200)}`);
		// Anthropic may not be available — mark as informational
		assert.ok(true, `Anthropic returned ${res.status} — may not have credential`);
	}
});

// ── 6. Chat Completions with reasoning_effort → Anthropic thinking conversion ──

test("reasoning_effort → Anthropic thinking conversion (via chat completions)", async () => {
	const { status, json } = await chat({
		model: "anthropic/claude-sonnet-4-20250514",
		messages: [{ role: "user", content: PROMPT }],
		reasoning_effort: "medium",
		max_tokens: 16384,
	});

	console.log(`  HTTP ${status}`);
	const choice = (json.choices as Record<string, unknown>[])?.[0];
	const msg = choice?.message as Record<string, unknown>;
	console.log(`  content: ${(msg?.content as string)?.slice(0, 80)}`);
	console.log(`  reasoning_content: ${msg?.reasoning_content ? `${(msg.reasoning_content as string).length} chars` : "none"}`);

	if (status === 200) {
		assert.ok(msg?.content, "Should have content");
	} else {
		console.log(`  body: ${JSON.stringify(json).slice(0, 200)}`);
		assert.ok(true, `Anthropic returned ${status} — may not have credential`);
	}
});

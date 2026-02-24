/**
 * Anthropic SDK compatibility tests
 *
 * Proves that Keyaos /v1/messages endpoint is compatible with the Anthropic SDK.
 * Covers: messages, streaming, system messages, tool use, x-api-key auth.
 *
 * Prerequisites: local dev server running, credentials configured, KEYAOS_API_KEY set.
 */

import assert from "node:assert";
import test from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { API_BASE, KEYAOS_KEY } from "./utils.ts";

const client = new Anthropic({
	apiKey: KEYAOS_KEY,
	baseURL: API_BASE,
});

const MODEL = "openai/gpt-4o-mini";

test("Anthropic SDK: message (non-streaming)", async () => {
	const msg = await client.messages.create({
		model: MODEL,
		max_tokens: 100,
		messages: [{ role: "user", content: 'Say "hello" in one word' }],
	});

	assert.strictEqual(msg.type, "message");
	assert.strictEqual(msg.role, "assistant");
	assert.ok(msg.content.length > 0);
	assert.strictEqual(msg.content[0].type, "text");
	assert.ok(msg.stop_reason, "Should have stop_reason");
	assert.ok(msg.usage.input_tokens >= 0, "Should have input_tokens");
	assert.ok(msg.usage.output_tokens > 0, "Should have output_tokens");
	console.log(
		`  Content: ${msg.content[0].type === "text" ? msg.content[0].text : ""}`,
	);
});

test("Anthropic SDK: message (streaming)", async () => {
	const stream = await client.messages.create({
		model: MODEL,
		max_tokens: 100,
		messages: [{ role: "user", content: "Count to 3" }],
		stream: true,
	});

	const eventTypes = new Set<string>();
	let content = "";

	for await (const event of stream) {
		eventTypes.add(event.type);
		if (
			event.type === "content_block_delta" &&
			event.delta.type === "text_delta"
		) {
			content += event.delta.text;
		}
	}

	assert.ok(eventTypes.has("message_start"), "Should have message_start");
	assert.ok(
		eventTypes.has("content_block_start"),
		"Should have content_block_start",
	);
	assert.ok(
		eventTypes.has("content_block_delta"),
		"Should have content_block_delta",
	);
	assert.ok(
		eventTypes.has("content_block_stop"),
		"Should have content_block_stop",
	);
	assert.ok(eventTypes.has("message_delta"), "Should have message_delta");
	assert.ok(eventTypes.has("message_stop"), "Should have message_stop");
	assert.ok(content.length > 0, "Should have content");
	console.log(
		`  Events: [${[...eventTypes].join(", ")}], Content: ${content.slice(0, 60)}`,
	);
});

test("Anthropic SDK: system message", async () => {
	const msg = await client.messages.create({
		model: MODEL,
		max_tokens: 100,
		system: "Always respond with exactly one word.",
		messages: [{ role: "user", content: "What color is the sky?" }],
	});

	assert.ok(msg.content.length > 0);
	const text = msg.content[0].type === "text" ? msg.content[0].text : "";
	assert.ok(text.length > 0, "Should have text");
	console.log(`  Content: ${text}`);
});

test("Anthropic SDK: tool use", async () => {
	const msg = await client.messages.create({
		model: MODEL,
		max_tokens: 200,
		messages: [{ role: "user", content: "What's the weather in Paris?" }],
		tools: [
			{
				name: "get_weather",
				description: "Get weather for a city",
				input_schema: {
					type: "object" as const,
					properties: { city: { type: "string" } },
					required: ["city"],
				},
			},
		],
		tool_choice: { type: "tool" as const, name: "get_weather" },
	});

	const toolBlock = msg.content.find(
		(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
	);
	assert.ok(toolBlock, "Should have tool_use block");
	assert.strictEqual(toolBlock.name, "get_weather");
	assert.ok(toolBlock.input, "Should have input");
	assert.ok(toolBlock.id, "Should have tool_use id");
	console.log(
		`  Tool: ${toolBlock.name}(${JSON.stringify(toolBlock.input)})`,
	);
});

const REASONING_MODEL = "deepseek/deepseek-r1-0528";

test("Anthropic SDK: reasoning → thinking (non-streaming)", async () => {
	const msg = await client.messages.create({
		model: REASONING_MODEL,
		max_tokens: 300,
		messages: [{ role: "user", content: "What is 15 * 37?" }],
	});

	const types = msg.content.map((b) => b.type);
	const thinkingBlock = msg.content.find((b) => b.type === "thinking");
	assert.ok(thinkingBlock, `Should have thinking block, got: [${types}]`);
	const thinking = (thinkingBlock as unknown as { thinking: string }).thinking;
	assert.ok(thinking.length > 0, "Thinking should have content");
	console.log(`  Blocks: [${types}], Thinking: "${thinking.slice(0, 60)}..."`);
});

test("Anthropic SDK: reasoning → thinking (streaming)", async () => {
	const stream = await client.messages.create({
		model: REASONING_MODEL,
		max_tokens: 300,
		messages: [{ role: "user", content: "What is 15 * 37?" }],
		stream: true,
	});

	const blockTypes: string[] = [];
	let thinkingText = "";
	let contentText = "";

	for await (const event of stream) {
		if (event.type === "content_block_start") {
			blockTypes.push(event.content_block.type);
		}
		if (event.type === "content_block_delta") {
			if (event.delta.type === "thinking_delta") {
				thinkingText += (event.delta as unknown as { thinking: string }).thinking;
			} else if (event.delta.type === "text_delta") {
				contentText += event.delta.text;
			}
		}
	}

	assert.ok(blockTypes.includes("thinking"), `Should have thinking block, got: [${blockTypes}]`);
	assert.ok(thinkingText.length > 0, "Should have thinking content");
	console.log(
		`  Blocks: [${blockTypes}], Thinking: "${thinkingText.slice(0, 50)}...", Content: "${contentText.slice(0, 50)}"`,
	);
});

test("Anthropic SDK: x-api-key authentication", async () => {
	const res = await fetch(`${API_BASE}/v1/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": KEYAOS_KEY,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: 10,
			messages: [{ role: "user", content: "Hi" }],
		}),
	});

	assert.strictEqual(res.status, 200);
	const data = (await res.json()) as { type: string };
	assert.strictEqual(data.type, "message");
	console.log("  x-api-key auth: OK");
});

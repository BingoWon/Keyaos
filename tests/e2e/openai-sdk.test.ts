/**
 * OpenAI SDK compatibility tests
 *
 * Proves that Keyaos is a drop-in replacement for the OpenAI API.
 * Covers: models, chat completions, streaming, tool calling, structured output.
 *
 * Prerequisites: local dev server running, credentials configured, KEYAOS_API_KEY set.
 */

import assert from "node:assert";
import test from "node:test";
import OpenAI from "openai";
import { API_BASE, KEYAOS_KEY } from "./utils.ts";

const client = new OpenAI({
	apiKey: KEYAOS_KEY,
	baseURL: `${API_BASE}/v1`,
});

const MODEL = "openai/gpt-4o-mini";

test("OpenAI SDK: list models", async () => {
	const list = await client.models.list();
	const models: OpenAI.Model[] = [];
	for await (const m of list) models.push(m);

	assert.ok(models.length > 0, "Should return models");
	assert.ok(models[0].id, "Model should have id");
	assert.strictEqual(models[0].object, "model");
	console.log(`  Models: ${models.length}`);
});

test("OpenAI SDK: chat completion (non-streaming)", async () => {
	const res = await client.chat.completions.create({
		model: MODEL,
		messages: [{ role: "user", content: 'Say "hello" in one word' }],
	});

	assert.ok(res.id, "Should have id");
	assert.strictEqual(res.object, "chat.completion");
	assert.ok(res.choices.length > 0);
	assert.ok(res.choices[0].message.content);
	console.log(`  Content: ${res.choices[0].message.content}`);
});

test("OpenAI SDK: chat completion (streaming)", async () => {
	const stream = await client.chat.completions.create({
		model: MODEL,
		messages: [{ role: "user", content: "Count to 3" }],
		stream: true,
	});

	let chunks = 0;
	let content = "";
	for await (const chunk of stream) {
		chunks++;
		content += chunk.choices[0]?.delta?.content ?? "";
	}

	assert.ok(chunks > 0, "Should receive chunks");
	assert.ok(content.length > 0, "Should have content");
	console.log(`  Chunks: ${chunks}, Content: ${content.slice(0, 60)}`);
});

test("OpenAI SDK: tool calling", async () => {
	const res = await client.chat.completions.create({
		model: MODEL,
		messages: [{ role: "user", content: "What's the weather in Paris?" }],
		tools: [
			{
				type: "function",
				function: {
					name: "get_weather",
					description: "Get weather for a city",
					parameters: {
						type: "object",
						properties: { city: { type: "string" } },
						required: ["city"],
					},
				},
			},
		],
		tool_choice: { type: "function", function: { name: "get_weather" } },
	});

	const tc = res.choices[0].message.tool_calls;
	assert.ok(tc && tc.length > 0, "Should have tool_calls");
	assert.strictEqual(tc[0].function.name, "get_weather");
	const args = JSON.parse(tc[0].function.arguments);
	assert.ok(args.city, "Should have city argument");
	console.log(`  Tool: ${tc[0].function.name}(${tc[0].function.arguments})`);
});

test("OpenAI SDK: structured output (JSON mode)", async () => {
	const res = await client.chat.completions.create({
		model: MODEL,
		messages: [
			{ role: "system", content: "Respond with JSON only." },
			{
				role: "user",
				content:
					'Return a JSON object with "name" (string) and "age" (number) for a fictional person.',
			},
		],
		response_format: { type: "json_object" },
	});

	const raw = res.choices[0].message.content;
	assert.ok(raw, "Should have content");
	const parsed = JSON.parse(raw);
	assert.ok(parsed.name, "Should have name");
	assert.ok(typeof parsed.age === "number", "age should be number");
	console.log(`  JSON: ${raw}`);
});

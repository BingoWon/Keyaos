/**
 * Capability verification — tests all OpenRouter-supported features
 * against OpenRouter directly AND through Keyaos (both OpenAI & Anthropic endpoints).
 *
 * Usage: node --env-file=.env.local --experimental-strip-types --no-warnings scripts/verify-capabilities.ts
 */

const OR_KEY = process.env.OR_KEY!;
const KEYAOS_KEY = process.env.KEYAOS_API_KEY!;
const OR_BASE = "https://openrouter.ai/api/v1";
const KEYAOS_BASE = process.env.API_BASE || "http://localhost:5173";

if (!OR_KEY) throw new Error("OR_KEY required");
if (!KEYAOS_KEY) throw new Error("KEYAOS_API_KEY required");

const MODEL = "openai/gpt-4o-mini";
const VISION_MODEL = "openai/gpt-4o-mini"; // supports vision
const REASONING_MODEL = "deepseek/deepseek-r1-0528";

// ─── Helpers ─────────────────────────────────────────────

type Result = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };
const results: Result[] = [];

async function run(name: string, fn: () => Promise<string>) {
	process.stdout.write(`  ${name} ... `);
	try {
		const detail = await fn();
		results.push({ name, status: "PASS", detail });
		console.log(`✅  ${detail}`);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		results.push({ name, status: "FAIL", detail: msg });
		console.log(`❌  ${msg}`);
	}
}

function skip(name: string, reason: string) {
	results.push({ name, status: "SKIP", detail: reason });
	console.log(`  ${name} ... ⏭️  ${reason}`);
}

async function openaiCall(
	baseUrl: string,
	apiKey: string,
	body: Record<string, unknown>,
	stream = false,
): Promise<Response> {
	return fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
		body: JSON.stringify({ ...body, stream, ...(stream ? { stream_options: { include_usage: true } } : {}) }),
	});
}

async function anthropicCall(
	baseUrl: string,
	apiKey: string,
	body: Record<string, unknown>,
): Promise<Response> {
	return fetch(`${baseUrl}/v1/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify(body),
	});
}

async function collectSSE(res: Response): Promise<string[]> {
	const text = await res.text();
	return text.split("\n").filter((l) => l.startsWith("data: ") && l !== "data: [DONE]");
}

// Tiny PNG (1x1 red pixel) for vision tests
const TINY_PNG_B64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

// ─── 1. Streaming Tool Calling ───────────────────────────

async function testStreamingToolCall(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Streaming tool calling`, async () => {
		const res = await openaiCall(baseUrl, apiKey, {
			model: MODEL,
			messages: [{ role: "user", content: "What's the weather in Paris?" }],
			tools: [{
				type: "function",
				function: {
					name: "get_weather",
					description: "Get weather for a city",
					parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
				},
			}],
			tool_choice: { type: "function", function: { name: "get_weather" } },
		}, true);

		if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		const lines = await collectSSE(res);
		const hasToolCallId = lines.some((l) => l.includes('"tool_calls"') && l.includes('"id"'));
		const hasArgChunk = lines.some((l) => l.includes('"arguments"'));
		if (!hasToolCallId) throw new Error("No tool_call id in stream");
		if (!hasArgChunk) throw new Error("No argument chunks in stream");
		return `${lines.length} chunks, tool_call id + argument deltas present`;
	});
}

// ─── 2. Multimodal / Vision ──────────────────────────────

async function testVision(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Vision (base64 image)`, async () => {
		const res = await openaiCall(baseUrl, apiKey, {
			model: VISION_MODEL,
			messages: [{
				role: "user",
				content: [
					{ type: "text", text: "Describe this image in 5 words or fewer." },
					{ type: "image_url", image_url: { url: `data:image/png;base64,${TINY_PNG_B64}` } },
				],
			}],
			max_tokens: 30,
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		const data = await res.json() as Record<string, unknown>;
		const choices = data.choices as Record<string, unknown>[];
		const content = (choices[0]?.message as Record<string, unknown>)?.content as string;
		if (!content) throw new Error("No content returned");
		return `"${content.slice(0, 60)}"`;
	});
}

async function testVisionAnthropic(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Vision (Anthropic image block)`, async () => {
		const res = await anthropicCall(baseUrl, apiKey, {
			model: VISION_MODEL,
			max_tokens: 30,
			messages: [{
				role: "user",
				content: [
					{ type: "image", source: { type: "base64", media_type: "image/png", data: TINY_PNG_B64 } },
					{ type: "text", text: "Describe this image in 5 words or fewer." },
				],
			}],
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		const data = await res.json() as Record<string, unknown>;
		if (data.type !== "message") throw new Error(`Unexpected type: ${data.type}`);
		const blocks = data.content as { type: string; text?: string }[];
		const text = blocks.find((b) => b.type === "text")?.text;
		if (!text) throw new Error("No text in response");
		return `"${text.slice(0, 60)}"`;
	});
}

// ─── 3. Multi-turn Tool Use ──────────────────────────────

async function testMultiTurnTool(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Multi-turn tool use`, async () => {
		// Step 1: initial call that triggers tool use
		const r1 = await openaiCall(baseUrl, apiKey, {
			model: MODEL,
			messages: [{ role: "user", content: "What's the weather in Paris?" }],
			tools: [{
				type: "function",
				function: {
					name: "get_weather",
					description: "Get weather",
					parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
				},
			}],
			tool_choice: { type: "function", function: { name: "get_weather" } },
		});
		if (!r1.ok) throw new Error(`Step 1 HTTP ${r1.status}`);
		const d1 = await r1.json() as Record<string, unknown>;
		const msg1 = (d1.choices as Record<string, unknown>[])[0].message as Record<string, unknown>;
		const tc = (msg1.tool_calls as Record<string, unknown>[])[0];
		const tcId = tc.id as string;

		// Step 2: send tool result back
		const r2 = await openaiCall(baseUrl, apiKey, {
			model: MODEL,
			messages: [
				{ role: "user", content: "What's the weather in Paris?" },
				msg1,
				{ role: "tool", tool_call_id: tcId, content: '{"temp": "22°C", "condition": "sunny"}' },
			],
			tools: [{
				type: "function",
				function: {
					name: "get_weather",
					description: "Get weather",
					parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
				},
			}],
		});
		if (!r2.ok) throw new Error(`Step 2 HTTP ${r2.status}: ${await r2.text()}`);
		const d2 = await r2.json() as Record<string, unknown>;
		const finalContent = ((d2.choices as Record<string, unknown>[])[0].message as Record<string, unknown>).content as string;
		if (!finalContent) throw new Error("No final content");
		return `"${finalContent.slice(0, 60)}"`;
	});
}

async function testMultiTurnToolAnthropic(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Multi-turn tool use (Anthropic format)`, async () => {
		// Step 1: trigger tool use
		const r1 = await anthropicCall(baseUrl, apiKey, {
			model: MODEL,
			max_tokens: 200,
			messages: [{ role: "user", content: "What's the weather in Paris?" }],
			tools: [{
				name: "get_weather",
				description: "Get weather",
				input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
			}],
			tool_choice: { type: "tool", name: "get_weather" },
		});
		if (!r1.ok) throw new Error(`Step 1 HTTP ${r1.status}: ${await r1.text()}`);
		const d1 = await r1.json() as Record<string, unknown>;
		const content1 = d1.content as { type: string; id?: string; name?: string; input?: unknown; text?: string }[];
		const toolUse = content1.find((b) => b.type === "tool_use");
		if (!toolUse) throw new Error("No tool_use block in step 1");

		// Step 2: send tool_result
		const r2 = await anthropicCall(baseUrl, apiKey, {
			model: MODEL,
			max_tokens: 200,
			messages: [
				{ role: "user", content: "What's the weather in Paris?" },
				{ role: "assistant", content: content1 },
				{
					role: "user",
					content: [
						{ type: "tool_result", tool_use_id: toolUse.id, content: '{"temp": "22°C", "condition": "sunny"}' },
					],
				},
			],
			tools: [{
				name: "get_weather",
				description: "Get weather",
				input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
			}],
		});
		if (!r2.ok) throw new Error(`Step 2 HTTP ${r2.status}: ${await r2.text()}`);
		const d2 = await r2.json() as Record<string, unknown>;
		const content2 = d2.content as { type: string; text?: string }[];
		const finalText = content2.find((b) => b.type === "text")?.text;
		if (!finalText) throw new Error("No final text in step 2");
		return `"${finalText.slice(0, 60)}"`;
	});
}

// ─── 4. Streaming Tool Calling (Anthropic) ───────────────

async function testStreamingToolCallAnthropic(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Streaming tool calling (Anthropic)`, async () => {
		const res = await anthropicCall(baseUrl, apiKey, {
			model: MODEL,
			max_tokens: 200,
			stream: true,
			messages: [{ role: "user", content: "What's the weather in Paris?" }],
			tools: [{
				name: "get_weather",
				description: "Get weather",
				input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
			}],
			tool_choice: { type: "tool", name: "get_weather" },
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		const text = await res.text();
		const lines = text.split("\n");

		const events = new Set<string>();
		for (const l of lines) {
			if (l.startsWith("event: ")) events.add(l.replace("event: ", "").trim());
		}

		const hasToolUseStart = text.includes('"type":"tool_use"') || text.includes('"type": "tool_use"');
		const hasInputDelta = text.includes("input_json_delta");
		if (!hasToolUseStart) throw new Error("No tool_use content_block_start");
		if (!hasInputDelta) throw new Error("No input_json_delta");
		return `events: [${[...events].join(", ")}]`;
	});
}

// ─── 5. Structured Output (json_schema) ──────────────────

async function testJsonSchema(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Structured output (json_schema)`, async () => {
		const res = await openaiCall(baseUrl, apiKey, {
			model: MODEL,
			messages: [
				{ role: "user", content: "Give me a fictional person." },
			],
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "person",
					strict: true,
					schema: {
						type: "object",
						properties: {
							name: { type: "string" },
							age: { type: "number" },
						},
						required: ["name", "age"],
						additionalProperties: false,
					},
				},
			},
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		const data = await res.json() as Record<string, unknown>;
		const content = ((data.choices as Record<string, unknown>[])[0]?.message as Record<string, unknown>)?.content as string;
		const parsed = JSON.parse(content);
		if (!parsed.name || typeof parsed.age !== "number") throw new Error(`Invalid schema: ${content}`);
		return `${content}`;
	});
}

// ─── 6. Reasoning / Thinking ─────────────────────────────

async function testReasoning(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Reasoning (non-streaming)`, async () => {
		const res = await openaiCall(baseUrl, apiKey, {
			model: REASONING_MODEL,
			messages: [{ role: "user", content: "What is 15 * 37?" }],
			max_tokens: 500,
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		const data = await res.json() as Record<string, unknown>;
		const message = (data.choices as Record<string, unknown>[])[0]?.message as Record<string, unknown>;

		const content = (message?.content as string) || "";
		// OpenRouter uses "reasoning", DeepSeek direct uses "reasoning_content"
		const reasoning = (message?.reasoning as string) || (message?.reasoning_content as string) || "";
		return `content="${content.slice(0, 40)}", reasoning=${reasoning ? `"${reasoning.slice(0, 40)}..."` : "ABSENT"}`;
	});
}

async function testReasoningStreaming(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Reasoning (streaming)`, async () => {
		const res = await openaiCall(baseUrl, apiKey, {
			model: REASONING_MODEL,
			messages: [{ role: "user", content: "What is 15 * 37?" }],
			max_tokens: 500,
		}, true);

		if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		const lines = await collectSSE(res);

		let reasoningText = "";
		let contentText = "";

		for (const l of lines) {
			const data = JSON.parse(l.substring(6));
			const delta = (data.choices as Record<string, unknown>[])?.[0]?.delta as Record<string, unknown>;
			if (!delta) continue;
			if (delta.reasoning) reasoningText += delta.reasoning;
			if (delta.reasoning_content) reasoningText += delta.reasoning_content;
			if (delta.content) contentText += delta.content;
		}

		return `${lines.length} chunks, reasoning=${reasoningText ? `"${reasoningText.slice(0, 40)}..."` : "ABSENT"}, content=${contentText ? `"${contentText.slice(0, 40)}"` : "ABSENT"}`;
	});
}

async function testReasoningAnthropic(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Reasoning → Anthropic thinking block`, async () => {
		const res = await anthropicCall(baseUrl, apiKey, {
			model: REASONING_MODEL,
			max_tokens: 500,
			messages: [{ role: "user", content: "What is 15 * 37?" }],
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		const data = await res.json() as Record<string, unknown>;
		const blocks = data.content as { type: string; text?: string; thinking?: string }[];
		const types = blocks.map((b) => b.type);
		const hasThinking = types.includes("thinking");
		const hasText = types.includes("text");
		return `blocks: [${types.join(", ")}], thinking=${hasThinking ? "YES" : "ABSENT"}, text=${hasText ? "YES" : "ABSENT"}`;
	});

	await run(`[${label}] Reasoning streaming → Anthropic thinking events`, async () => {
		const res = await anthropicCall(baseUrl, apiKey, {
			model: REASONING_MODEL,
			max_tokens: 500,
			stream: true,
			messages: [{ role: "user", content: "What is 15 * 37?" }],
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		const text = await res.text();
		const lines = text.split("\n");

		const events = new Set<string>();
		for (const l of lines) {
			if (l.startsWith("event: ")) events.add(l.replace("event: ", "").trim());
		}

		const hasThinkingDelta = text.includes("thinking_delta") || text.includes('"thinking"');
		return `events: [${[...events].join(", ")}], thinking_delta=${hasThinkingDelta ? "YES" : "ABSENT"}`;
	});
}

// ─── 7. Error Handling ───────────────────────────────────

async function testErrors(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Error: invalid model`, async () => {
		const res = await openaiCall(baseUrl, apiKey, {
			model: "nonexistent/model-xyz",
			messages: [{ role: "user", content: "hi" }],
		});
		if (res.ok) throw new Error("Expected error but got 200");
		const data = await res.json() as Record<string, unknown>;
		const err = data.error as Record<string, unknown>;
		if (!err?.message) throw new Error(`Unexpected error format: ${JSON.stringify(data)}`);
		return `${res.status}: ${(err.message as string).slice(0, 80)}`;
	});

	await run(`[${label}] Error: missing auth`, async () => {
		const res = await fetch(`${baseUrl}/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "hi" }] }),
		});
		if (res.ok) throw new Error("Expected error but got 200");
		return `${res.status}: auth required`;
	});
}

async function testErrorsAnthropic(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Error: missing max_tokens (Anthropic)`, async () => {
		const res = await anthropicCall(baseUrl, apiKey, {
			model: MODEL,
			messages: [{ role: "user", content: "hi" }],
		});
		if (res.ok) throw new Error("Expected error but got 200");
		const data = await res.json() as Record<string, unknown>;
		if (data.type !== "error") throw new Error(`Expected type=error, got ${data.type}`);
		const err = data.error as Record<string, unknown>;
		if (!err?.message) throw new Error(`Unexpected format: ${JSON.stringify(data)}`);
		return `${res.status}: ${err.type} — ${err.message}`;
	});

	await run(`[${label}] Error: invalid model (Anthropic)`, async () => {
		const res = await anthropicCall(baseUrl, apiKey, {
			model: "nonexistent/model-xyz",
			max_tokens: 10,
			messages: [{ role: "user", content: "hi" }],
		});
		if (res.ok) throw new Error("Expected error but got 200");
		const data = await res.json() as Record<string, unknown>;
		if (data.type !== "error") throw new Error(`Expected type=error, got ${data.type}`);
		return `${res.status}: Anthropic error format correct`;
	});
}

// ─── 8. Vision URL (non-base64) ──────────────────────────

async function testVisionURL(label: string, baseUrl: string, apiKey: string) {
	await run(`[${label}] Vision (URL image)`, async () => {
		const res = await openaiCall(baseUrl, apiKey, {
			model: VISION_MODEL,
			messages: [{
				role: "user",
				content: [
					{ type: "text", text: "What is in this image? Reply in 5 words or fewer." },
					{ type: "image_url", image_url: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png" } },
				],
			}],
			max_tokens: 30,
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
		const data = await res.json() as Record<string, unknown>;
		const content = ((data.choices as Record<string, unknown>[])[0]?.message as Record<string, unknown>)?.content as string;
		if (!content) throw new Error("No content returned");
		return `"${content.slice(0, 60)}"`;
	});
}

// ═══ Run all ═════════════════════════════════════════════

async function main() {
	console.log("╔═══════════════════════════════════════════════════╗");
	console.log("║  Keyaos Capability Verification                  ║");
	console.log("╚═══════════════════════════════════════════════════╝\n");

	// ── Section A: OpenRouter direct (baseline) ──
	console.log("─── A. OpenRouter Direct (baseline) ───────────────\n");

	await testStreamingToolCall("OR", OR_BASE, OR_KEY);
	await testVision("OR", OR_BASE, OR_KEY);
	await testVisionURL("OR", OR_BASE, OR_KEY);
	await testMultiTurnTool("OR", OR_BASE, OR_KEY);
	await testJsonSchema("OR", OR_BASE, OR_KEY);
	await testReasoning("OR", OR_BASE, OR_KEY);
	await testReasoningStreaming("OR", OR_BASE, OR_KEY);

	// ── Section B: Keyaos OpenAI endpoint ──
	console.log("\n─── B. Keyaos /v1/chat/completions ─────────────────\n");

	await testStreamingToolCall("Keyaos-OAI", `${KEYAOS_BASE}/v1`, KEYAOS_KEY);
	await testVision("Keyaos-OAI", `${KEYAOS_BASE}/v1`, KEYAOS_KEY);
	await testVisionURL("Keyaos-OAI", `${KEYAOS_BASE}/v1`, KEYAOS_KEY);
	await testMultiTurnTool("Keyaos-OAI", `${KEYAOS_BASE}/v1`, KEYAOS_KEY);
	await testJsonSchema("Keyaos-OAI", `${KEYAOS_BASE}/v1`, KEYAOS_KEY);
	await testReasoning("Keyaos-OAI", `${KEYAOS_BASE}/v1`, KEYAOS_KEY);
	await testReasoningStreaming("Keyaos-OAI", `${KEYAOS_BASE}/v1`, KEYAOS_KEY);
	await testErrors("Keyaos-OAI", `${KEYAOS_BASE}/v1`, KEYAOS_KEY);

	// ── Section C: Keyaos Anthropic endpoint ──
	console.log("\n─── C. Keyaos /v1/messages (Anthropic) ─────────────\n");

	await testVisionAnthropic("Keyaos-Anth", KEYAOS_BASE, KEYAOS_KEY);
	await testMultiTurnToolAnthropic("Keyaos-Anth", KEYAOS_BASE, KEYAOS_KEY);
	await testStreamingToolCallAnthropic("Keyaos-Anth", KEYAOS_BASE, KEYAOS_KEY);
	await testReasoningAnthropic("Keyaos-Anth", KEYAOS_BASE, KEYAOS_KEY);
	await testErrorsAnthropic("Keyaos-Anth", KEYAOS_BASE, KEYAOS_KEY);

	// ── Summary ──
	console.log("\n═══ Summary ════════════════════════════════════════\n");

	const pass = results.filter((r) => r.status === "PASS");
	const fail = results.filter((r) => r.status === "FAIL");
	const skipped = results.filter((r) => r.status === "SKIP");

	console.log(`  PASS: ${pass.length}  FAIL: ${fail.length}  SKIP: ${skipped.length}  TOTAL: ${results.length}\n`);

	if (fail.length) {
		console.log("  ❌ Failures:");
		for (const f of fail) console.log(`     ${f.name}: ${f.detail}`);
		console.log();
	}
	if (skipped.length) {
		console.log("  ⏭️  Skipped:");
		for (const s of skipped) console.log(`     ${s.name}: ${s.detail}`);
		console.log();
	}

	process.exit(fail.length > 0 ? 1 : 0);
}

main();

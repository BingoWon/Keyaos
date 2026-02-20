import { test } from "node:test";
import assert from "node:assert";

test("Transaction Logger API test via explicit wait", async () => {
    // Send a payload to the worker and wait explicitly for the completion
    const response = await fetch("http://localhost:8787/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages: [{ role: "user", content: "Say hello!" }],
            stream: false
        })
    });
    
    // Read JSON completely to trigger the onUsage hook
    const data = await response.json();
    console.log("Response body:", data);

    // Give waitUntil 1 second to fire DB inserts before test ends
    await new Promise(r => setTimeout(r, 1000));
});

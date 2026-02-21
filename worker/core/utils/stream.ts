/**
 * Stream & JSON Interception Utilities
 *
 * Provides zero-latency interception of downstream API responses.
 * By teeing the response body, we monitor the chunks entirely out-of-band
 * without blocking the hot path delivery back to the client.
 */

export interface TokenUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	/** OpenRouter returns this */
	cost?: number;
	/** DeepInfra returns this */
	estimated_cost?: number;
}

export function interceptResponse(
	response: Response,
	ctx: ExecutionContext,
	onUsage: (usage: TokenUsage) => void,
): Response {
	const contentType = response.headers.get("content-type") || "";

	if (contentType.includes("text/event-stream")) {
		return interceptSSEStream(response, ctx, onUsage);
	}

	if (contentType.includes("application/json")) {
		const parseTask = response
			.clone()
			.json()
			.then((body) => {
				const parsed = body as { usage?: TokenUsage };
				if (parsed?.usage) {
					onUsage({
						prompt_tokens: parsed.usage.prompt_tokens || 0,
						completion_tokens: parsed.usage.completion_tokens || 0,
						total_tokens: parsed.usage.total_tokens || 0,
						cost: parsed.usage.cost,
						estimated_cost: parsed.usage.estimated_cost,
					});
				}
			})
			.catch(() => {});

		ctx.waitUntil(parseTask);
		return response;
	}

	return response;
}

function interceptSSEStream(
	response: Response,
	ctx: ExecutionContext,
	onUsage: (usage: TokenUsage) => void,
): Response {
	if (!response.body) return response;

	const [clientStream, monitorStream] = response.body.tee();

	const monitorTask = (async () => {
		const reader = monitorStream.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				while (true) {
					const frameEnd = buffer.indexOf("\n\n");
					if (frameEnd === -1) break;

					const frame = buffer.slice(0, frameEnd);
					buffer = buffer.slice(frameEnd + 2);

					for (const line of frame.split("\n")) {
						const trimmed = line.trim();
						if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]")
							continue;

						try {
							const data = JSON.parse(trimmed.substring(6));
							if (data?.usage) {
								onUsage({
									prompt_tokens: data.usage.prompt_tokens || 0,
									completion_tokens: data.usage.completion_tokens || 0,
									total_tokens: data.usage.total_tokens || 0,
									cost: data.usage.cost,
									estimated_cost: data.usage.estimated_cost,
								});
							}
						} catch {
							// Ignore partial chunk JSON errors
						}
					}
				}
			}
		} catch (e) {
			console.error("[STREAM MONITOR] Fatal error:", e);
		}
	})();

	ctx.waitUntil(monitorTask);

	return new Response(clientStream, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

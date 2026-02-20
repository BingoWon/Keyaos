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
			.then((body: any) => {
				if (body?.usage) {
					onUsage({
						prompt_tokens: body.usage.prompt_tokens || 0,
						completion_tokens: body.usage.completion_tokens || 0,
						total_tokens: body.usage.total_tokens || 0,
					});
				}
			})
			.catch(() => {});

		ctx.waitUntil(parseTask);
		return response;
	}

	return response;
}

/**
 * Parses Server-Sent Events (SSE) format out-of-band to count tokens.
 */
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

					const lines = frame.split("\n");
					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed.startsWith("data: ")) continue;
						if (trimmed === "data: [DONE]") continue;

						try {
							const jsonStr = trimmed.substring(6);
							const data = JSON.parse(jsonStr);

							if (data?.usage) {
								onUsage({
									prompt_tokens: data.usage.prompt_tokens || 0,
									completion_tokens: data.usage.completion_tokens || 0,
									total_tokens: data.usage.total_tokens || 0,
								});
							}
						} catch (e) {
							// Ignore partial chunk JSON errors
						}
					}
				}
			}
		} catch (e) {
			console.error("[STREAM MONITOR] Fatal error reading stream copy:", e);
		} finally {
			// reader will auto-release but explicitly close if needed
		}
	})();

	ctx.waitUntil(monitorTask);

	return new Response(clientStream, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

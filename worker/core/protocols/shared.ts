export function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return String(content ?? "");
	return content
		.filter((p) => p?.type === "text")
		.map((p) => p.text)
		.join("");
}

/** Extract the data payload from an SSE `data:` line, or null if not a data line. */
export function parseSSEDataLine(line: string): string | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("data:")) return null;
	const payload = trimmed.startsWith("data: ")
		? trimmed.substring(6)
		: trimmed.substring(5);
	return payload === "[DONE]" ? null : payload;
}

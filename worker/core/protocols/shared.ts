export function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return String(content ?? "");
	return content
		.filter((p) => p?.type === "text")
		.map((p) => p.text)
		.join("");
}

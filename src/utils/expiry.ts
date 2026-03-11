export type ExpiryPreset = "keep" | "never" | "7d" | "30d" | "90d" | "custom";

/**
 * Convert an expiry preset into a Unix timestamp (ms).
 * - "keep"   → undefined (no change, edit modal only)
 * - "never"  → null (no expiration)
 * - "7d/30d/90d" → Date.now() + days
 * - "custom" → parsed from ISO datetime string
 */
export function expiryToTimestamp(
	preset: ExpiryPreset,
	customDate: string,
): number | null | undefined {
	if (preset === "keep") return undefined;
	if (preset === "never") return null;
	if (preset === "custom" && customDate) return new Date(customDate).getTime();
	const days = { "7d": 7, "30d": 30, "90d": 90 }[preset];
	if (days) return Date.now() + days * 86_400_000;
	return null;
}

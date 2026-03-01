/**
 * Unified USD formatting with adaptive significant digits.
 *
 * >= $1: standard 2-decimal currency ($12.50, $2.19)
 * < $1:  4 significant digits, trailing zeros stripped (min 2 decimals)
 *        so multiplied prices like $0.1095 aren't rounded to $0.11
 */
function fmt(abs: number): string {
	if (abs >= 1) return abs.toFixed(2);
	const s = String(Number(abs.toPrecision(4)));
	const decimals = s.split(".")[1]?.length ?? 0;
	return decimals < 2 ? abs.toFixed(2) : s;
}

export function formatUSD(value: number): string {
	if (value === 0) return "$0.00";
	return `$${fmt(Math.abs(value))}`;
}

export function formatSignedUSD(value: number): string {
	if (value === 0) return "$0.00";
	const abs = Math.abs(value);
	const sign = value > 0 ? "+" : "-";
	return `${sign}$${fmt(abs)}`;
}

/** Format model pricing (input is cents-per-million-tokens) */
export function formatPrice(price: number): string {
	if (price === 0) return "Free";
	return `$${(price / 100).toPrecision(2)}`;
}

export function formatContext(len: number): string {
	if (len >= 1_000_000)
		return `${(len / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (len >= 1000) return `${(len / 1000).toFixed(0)}K`;
	return len.toString();
}

/** Compact date: "Jan 15, 2026" */
function formatDate(ms: number): string {
	return new Date(ms).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/** HH:MM:SS in 24-hour format, locale-aware */
export function formatTimestamp(date: Date): string {
	return date.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

/**
 * Context-aware relative time:
 *   < 1h  → "12m ago"
 *   < 1d  → "5h ago"
 *   < 30d → "3d ago"
 *   else  → "Jan 15, 2026"
 */
export function formatRelativeTime(ms: number): string {
	if (!ms) return "";
	const diff = Date.now() - ms;
	if (diff < 0) return formatDate(ms);

	const minutes = Math.floor(diff / 60_000);
	if (minutes < 60) return `${Math.max(1, minutes)}m ago`;

	const hours = Math.floor(diff / 3_600_000);
	if (hours < 24) return `${hours}h ago`;

	const days = Math.floor(diff / 86_400_000);
	if (days < 30) return `${days}d ago`;

	return formatDate(ms);
}

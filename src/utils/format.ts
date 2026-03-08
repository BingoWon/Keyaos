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

/** Format model pricing (input is USD per million tokens) */
export function formatPrice(price: number, freeLabel = "Free"): string {
	if (price === 0) return freeLabel;
	const raw =
		price >= 0.1 ? price.toFixed(2) : Number(price.toPrecision(3)).toString();
	const [int, dec] = raw.split(".");
	if (!dec) return `$${int}.00`;
	const trimmed = dec.replace(/0+$/, "");
	return `$${int}.${trimmed.padEnd(2, "0")}`;
}

export function formatContext(len: number): string {
	if (len >= 1_000_000)
		return `${(len / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (len >= 1000) return `${(len / 1000).toFixed(0)}K`;
	return len.toString();
}

/** Compact locale-aware date */
function formatDate(ms: number, locale?: string): string {
	return new Date(ms).toLocaleDateString(locale, {
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

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();

function getRtf(locale?: string): Intl.RelativeTimeFormat {
	const key = locale ?? "";
	let rtf = rtfCache.get(key);
	if (!rtf) {
		rtf = new Intl.RelativeTimeFormat(locale, {
			numeric: "always",
			style: "narrow",
		});
		rtfCache.set(key, rtf);
	}
	return rtf;
}

/**
 * Locale-aware relative time using Intl.RelativeTimeFormat (narrow style).
 *   < 1h  → "12m ago" / "12分钟前"
 *   < 1d  → "5h ago"  / "5小时前"
 *   < 30d → "3d ago"  / "3天前"
 *   else  → locale-formatted date
 */
export function formatRelativeTime(ms: number, locale?: string): string {
	if (!ms) return "";
	const diff = Date.now() - ms;
	if (diff < 0) return formatDate(ms, locale);

	const rtf = getRtf(locale);

	const minutes = Math.floor(diff / 60_000);
	if (minutes < 60) return rtf.format(-Math.max(1, minutes), "minute");

	const hours = Math.floor(diff / 3_600_000);
	if (hours < 24) return rtf.format(-hours, "hour");

	const days = Math.floor(diff / 86_400_000);
	if (days < 30) return rtf.format(-days, "day");

	return formatDate(ms, locale);
}

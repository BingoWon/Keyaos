/**
 * Unified USD formatting with adaptive significant digits.
 *
 * >= $0.01: standard 2-decimal currency format ($12.50, $0.05)
 * < $0.01:  3 significant digits, auto-adapts to magnitude ($0.00000675)
 *
 * toPrecision(3) eliminates IEEE 754 floating-point artifacts
 * (e.g. 0.00008631000000000001 → 0.0000863) while preserving
 * all meaningful billing precision.
 */
function fmt(abs: number): string {
	if (abs >= 0.01) return abs.toFixed(2);
	return String(Number(abs.toPrecision(3)));
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
	const usd = price / 100;
	if (usd >= 0.01) return `$${usd.toFixed(2)}`;
	return `$${Number(usd.toPrecision(3))}`;
}

export function formatContext(len: number): string {
	if (len >= 1_000_000)
		return `${(len / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (len >= 1000) return `${(len / 1000).toFixed(0)}K`;
	return len.toString();
}

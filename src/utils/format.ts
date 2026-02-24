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

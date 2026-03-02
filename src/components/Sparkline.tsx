import { useTranslation } from "react-i18next";

export interface SparklineData {
	points: number[];
	low: number;
	high: number;
	first: number;
	last: number;
}

function getTrendColor(lang: string, first: number, last: number) {
	const zhStyle = lang.startsWith("zh");
	const up = last >= first;
	if (zhStyle) return up ? "#ef4444" : "#22c55e";
	return up ? "#22c55e" : "#ef4444";
}

const VB_W = 100;
const VB_H = 32;

/**
 * Pure SVG sparkline — zero dependencies, ~1ms render.
 * Auto-fills container width via viewBox + preserveAspectRatio.
 */
export function Sparkline({
	data,
	className = "",
}: {
	data: SparklineData;
	className?: string;
}) {
	const { i18n } = useTranslation();
	const { points, first, last } = data;
	if (points.length < 2) return null;

	const color = getTrendColor(i18n.language, first, last);
	const min = Math.min(...points);
	const max = Math.max(...points);
	const range = max - min || 1;
	const pad = 2;
	const h = VB_H - pad * 2;

	const pts = points
		.map((v, i) => {
			const x = (i / (points.length - 1)) * VB_W;
			const y = pad + h - ((v - min) / range) * h;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");

	return (
		<svg
			viewBox={`0 0 ${VB_W} ${VB_H}`}
			preserveAspectRatio="none"
			className={`h-8 w-full ${className}`}
			role="img"
			aria-label="24h price trend"
		>
			<polyline
				points={pts}
				fill="none"
				stroke={color}
				strokeWidth={1.5}
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

/**
 * 24h price range indicator — dashed line with low/high labels
 * and a dot for the current price position. Fully auto-width.
 */
export function PriceRange({
	data,
	format,
	className = "",
}: {
	data: SparklineData;
	format: (v: number) => string;
	className?: string;
}) {
	const { low, high, last } = data;
	const range = high - low;
	const pct = range > 0 ? ((last - low) / range) * 100 : 50;

	return (
		<div className={`flex items-center gap-1.5 ${className}`}>
			<span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500 shrink-0">
				{format(low)}
			</span>
			<div className="relative flex-1 h-3 flex items-center min-w-6">
				<div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px border-t border-dashed border-gray-300 dark:border-gray-600" />
				<div
					className="absolute size-2 rounded-full bg-gray-500 dark:bg-gray-400 -translate-x-1/2 -translate-y-1/2 top-1/2"
					style={{ left: `${Math.max(4, Math.min(96, pct))}%` }}
				/>
			</div>
			<span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500 shrink-0">
				{format(high)}
			</span>
		</div>
	);
}

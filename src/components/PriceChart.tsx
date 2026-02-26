import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type CandlestickData,
	ColorType,
	CrosshairMode,
	type IChartApi,
	type Time,
	createChart,
} from "lightweight-charts";
import { useAuth } from "../auth";

interface Candle {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	totalTokens: number;
}

interface PriceChartProps {
	dimension: "model" | "provider";
	value: string;
	title?: string;
	className?: string;
}

const HOUR_OPTIONS = [1, 6, 24, 72, 168] as const;

function formatHours(h: number): string {
	if (h < 24) return `${h}h`;
	return `${h / 24}d`;
}

export function PriceChart({
	dimension,
	value,
	title,
	className = "",
}: PriceChartProps) {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const [hours, setHours] = useState<number>(24);
	const [candles, setCandles] = useState<Candle[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			setLoading(true);
			try {
				const token = await getToken();
				const res = await fetch(
					`/api/candles/${dimension}/${encodeURIComponent(value)}?hours=${hours}`,
					{ headers: { Authorization: `Bearer ${token}` } },
				);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = await res.json();
				if (!cancelled) setCandles(json.data ?? []);
			} catch {
				if (!cancelled) setCandles([]);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [dimension, value, hours, getToken]);

	useEffect(() => {
		if (!containerRef.current) return;

		const isDark = document.documentElement.classList.contains("dark");

		const chart = createChart(containerRef.current, {
			width: containerRef.current.clientWidth,
			height: 280,
			layout: {
				background: { type: ColorType.Solid, color: "transparent" },
				textColor: isDark ? "#9ca3af" : "#6b7280",
				fontSize: 11,
			},
			grid: {
				vertLines: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
				horzLines: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
			},
			crosshair: { mode: CrosshairMode.Normal },
			rightPriceScale: {
				borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
			},
			timeScale: {
				borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
				timeVisible: true,
				secondsVisible: false,
			},
		});

		chartRef.current = chart;

		const series = chart.addCandlestickSeries({
			upColor: "#22c55e",
			downColor: "#ef4444",
			borderDownColor: "#ef4444",
			borderUpColor: "#22c55e",
			wickDownColor: "#ef4444",
			wickUpColor: "#22c55e",
		});

		const data: CandlestickData<Time>[] = candles.map((c) => ({
			time: (c.time / 1000) as Time,
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
		}));

		series.setData(data);
		chart.timeScale().fitContent();

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) chart.applyOptions({ width: entry.contentRect.width });
		});
		observer.observe(containerRef.current);

		return () => {
			observer.disconnect();
			chart.remove();
			chartRef.current = null;
		};
	}, [candles]);

	return (
		<div
			className={`rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5 ${className}`}
		>
			<div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
				<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
					{title ?? t("chart.price_trend")}
				</h4>
				<div className="flex gap-1">
					{HOUR_OPTIONS.map((h) => (
						<button
							key={h}
							type="button"
							onClick={() => setHours(h)}
							className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
								hours === h
									? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
									: "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
							}`}
						>
							{formatHours(h)}
						</button>
					))}
				</div>
			</div>
			<div className="p-3">
				{loading ? (
					<div className="flex items-center justify-center h-[280px] text-sm text-gray-400">
						{t("common.loading")}
					</div>
				) : candles.length === 0 ? (
					<div className="flex items-center justify-center h-[280px] text-sm text-gray-400 dark:text-gray-500">
						{t("chart.no_data")}
					</div>
				) : (
					<div ref={containerRef} />
				)}
			</div>
		</div>
	);
}

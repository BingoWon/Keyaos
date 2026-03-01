import { ArrowPathIcon, ArrowsPointingInIcon } from "@heroicons/react/20/solid";
import {
	type CandlestickData,
	CandlestickSeries,
	ColorType,
	CrosshairMode,
	createChart,
	type IChartApi,
	type ISeriesApi,
	type Time,
} from "lightweight-charts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetch } from "../hooks/useFetch";

interface Candle {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
}

interface OHLCValues {
	open: number;
	high: number;
	low: number;
	close: number;
}

type ModelSubDimension = "input" | "output";

interface PriceChartProps {
	dimension: "model" | "provider";
	value: string;
	title?: string;
	className?: string;
}

const HOUR_OPTIONS = [1, 6, 24, 72, 168] as const;
const REFRESH_MS = 60_000;

function formatHours(h: number): string {
	if (h < 24) return `${h}h`;
	return `${h / 24}d`;
}

function isDarkMode(): boolean {
	return document.documentElement.classList.contains("dark");
}

function getThemeColors(dark: boolean) {
	return {
		textColor: dark ? "#9ca3af" : "#6b7280",
		gridColor: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
		borderColor: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
	};
}

function utcToLocal(utcMs: number): number {
	const d = new Date(utcMs);
	return (
		Date.UTC(
			d.getFullYear(),
			d.getMonth(),
			d.getDate(),
			d.getHours(),
			d.getMinutes(),
		) / 1000
	);
}

function toCandlestickData(candles: Candle[]): CandlestickData<Time>[] {
	return candles.map((c) => ({
		time: utcToLocal(c.time) as Time,
		open: c.open,
		high: c.high,
		low: c.low,
		close: c.close,
	}));
}

function formatTimestamp(date: Date): string {
	return date.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

export function PriceChart({
	dimension,
	value,
	title,
	className = "",
}: PriceChartProps) {
	const { t } = useTranslation();
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
	const latestOHLCRef = useRef<OHLCValues | null>(null);
	const hasInitialFitRef = useRef(false);

	const [hours, setHours] = useState<number>(6);
	const [subDim, setSubDim] = useState<ModelSubDimension>("input");
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const [legend, setLegend] = useState<OHLCValues | null>(null);

	const apiDimension = dimension === "model" ? `model:${subDim}` : "provider";
	const url = `/api/candles/${apiDimension}/${encodeURIComponent(value)}?hours=${hours}`;
	const { data: candles, loading, refetch } = useFetch<Candle[]>(url);

	const fmtPrice = useCallback(
		(p: number) =>
			dimension === "provider" ? `×${p.toFixed(3)}` : p.toFixed(4),
		[dimension],
	);

	useEffect(() => {
		if (candles) setLastUpdated(new Date());
	}, [candles]);

	// Auto-refresh every minute
	useEffect(() => {
		const id = setInterval(refetch, REFRESH_MS);
		return () => clearInterval(id);
	}, [refetch]);

	// Reset fit flag when query parameters change
	useEffect(() => {
		hasInitialFitRef.current = false;
	}, [hours, subDim]);

	// Create chart once
	useEffect(() => {
		if (!containerRef.current) return;

		const dark = isDarkMode();
		const colors = getThemeColors(dark);

		const chart = createChart(containerRef.current, {
			width: containerRef.current.clientWidth,
			height: 280,
			layout: {
				attributionLogo: false,
				background: { type: ColorType.Solid, color: "transparent" },
				textColor: colors.textColor,
				fontSize: 11,
			},
			grid: {
				vertLines: { color: colors.gridColor },
				horzLines: { color: colors.gridColor },
			},
			crosshair: { mode: CrosshairMode.Normal },
			rightPriceScale: { borderColor: colors.borderColor },
			timeScale: {
				borderColor: colors.borderColor,
				timeVisible: true,
				secondsVisible: false,
			},
		});

		const series = chart.addSeries(CandlestickSeries, {
			upColor: "#22c55e",
			downColor: "#ef4444",
			borderDownColor: "#ef4444",
			borderUpColor: "#22c55e",
			wickDownColor: "#ef4444",
			wickUpColor: "#22c55e",
			priceFormat:
				dimension === "provider"
					? {
							type: "custom" as const,
							formatter: (p: number) => `×${p.toFixed(3)}`,
						}
					: { type: "price" as const, precision: 4, minMove: 0.0001 },
		});

		chartRef.current = chart;
		seriesRef.current = series;

		chart.subscribeCrosshairMove((param) => {
			if (!param.time || !param.seriesData.size) {
				setLegend(latestOHLCRef.current);
				return;
			}
			const d = param.seriesData.get(series) as
				| CandlestickData<Time>
				| undefined;
			if (d) {
				setLegend({
					open: d.open,
					high: d.high,
					low: d.low,
					close: d.close,
				});
			}
		});

		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) chart.applyOptions({ width: entry.contentRect.width });
		});
		resizeObserver.observe(containerRef.current);

		const themeObserver = new MutationObserver(() => {
			const d = isDarkMode();
			const c = getThemeColors(d);
			chart.applyOptions({
				layout: {
					background: { type: ColorType.Solid, color: "transparent" },
					textColor: c.textColor,
				},
				grid: {
					vertLines: { color: c.gridColor },
					horzLines: { color: c.gridColor },
				},
				rightPriceScale: { borderColor: c.borderColor },
				timeScale: { borderColor: c.borderColor },
			});
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		return () => {
			themeObserver.disconnect();
			resizeObserver.disconnect();
			chart.remove();
			chartRef.current = null;
			seriesRef.current = null;
		};
	}, [dimension]);

	// Update series data
	useEffect(() => {
		if (!seriesRef.current || !candles) return;
		const data = toCandlestickData(candles);
		seriesRef.current.setData(data);

		if (candles.length > 0) {
			const last = candles[candles.length - 1];
			const vals: OHLCValues = {
				open: last.open,
				high: last.high,
				low: last.low,
				close: last.close,
			};
			latestOHLCRef.current = vals;
			setLegend(vals);
		}

		if (!hasInitialFitRef.current) {
			chartRef.current?.timeScale().fitContent();
			hasInitialFitRef.current = true;
		}
	}, [candles]);

	const handleResetView = useCallback(() => {
		chartRef.current?.timeScale().fitContent();
	}, []);

	const hasData = candles && candles.length > 0;

	const tipClass =
		"pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-20 whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover/tip:opacity-100 dark:bg-gray-700";
	const toolBtnClass =
		"p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors";

	return (
		<div
			className={`rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5 ${className}`}
		>
			{/* Header */}
			<div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-white/5">
				{/* Left: title + sub-dimension toggle */}
				<div className="flex items-center gap-3">
					<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
						{title ?? t("chart.price_trend")}
					</h4>
					{dimension === "model" && (
						<div className="flex gap-0.5 rounded-md bg-gray-100 p-0.5 dark:bg-white/10">
							{(["input", "output"] as const).map((d) => (
								<button
									key={d}
									type="button"
									onClick={() => setSubDim(d)}
									className={`px-2 py-0.5 text-xs rounded-md transition-colors capitalize ${
										subDim === d
											? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
											: "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
									}`}
								>
									{d}
								</button>
							))}
						</div>
					)}
				</div>

				{/* Center: time range */}
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

				{/* Right: timestamp + tools */}
				<div className="flex items-center gap-1.5">
					<span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
						{lastUpdated && formatTimestamp(lastUpdated)}
					</span>
					<span className="group/tip relative inline-flex">
						<button
							type="button"
							onClick={refetch}
							className={toolBtnClass}
						>
							<ArrowPathIcon
								className={`size-3.5 ${loading ? "animate-spin" : ""}`}
							/>
						</button>
						<span className={tipClass}>{t("chart.refresh")}</span>
					</span>
					<span className="group/tip relative inline-flex">
						<button
							type="button"
							onClick={handleResetView}
							className={toolBtnClass}
						>
							<ArrowsPointingInIcon className="size-3.5" />
						</button>
						<span className={tipClass}>{t("chart.reset_view")}</span>
					</span>
				</div>
			</div>

			{/* Chart */}
			<div className="relative p-3">
				{legend && hasData && (
					<div className="absolute top-5 left-5 z-10 pointer-events-none flex gap-3 text-[11px] font-mono tabular-nums">
						<span>
							<span className="text-gray-400 dark:text-gray-500">O </span>
							<span className="text-gray-600 dark:text-gray-300">
								{fmtPrice(legend.open)}
							</span>
						</span>
						<span>
							<span className="text-gray-400 dark:text-gray-500">H </span>
							<span className="text-emerald-600 dark:text-emerald-400">
								{fmtPrice(legend.high)}
							</span>
						</span>
						<span>
							<span className="text-gray-400 dark:text-gray-500">L </span>
							<span className="text-red-500 dark:text-red-400">
								{fmtPrice(legend.low)}
							</span>
						</span>
						<span>
							<span className="text-gray-400 dark:text-gray-500">C </span>
							<span
								className={
									legend.close >= legend.open
										? "text-emerald-600 dark:text-emerald-400"
										: "text-red-500 dark:text-red-400"
								}
							>
								{fmtPrice(legend.close)}
							</span>
						</span>
					</div>
				)}

				<div ref={containerRef} className="h-[280px]" />

				{!hasData && (
					<div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 bg-white/80 dark:bg-gray-900/80">
						{loading ? t("common.loading") : t("chart.no_data")}
					</div>
				)}
			</div>
		</div>
	);
}

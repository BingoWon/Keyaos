import {
	ArrowPathIcon,
	BanknotesIcon,
	ChartBarIcon,
	CreditCardIcon,
	ServerStackIcon,
	TableCellsIcon,
	UserGroupIcon,
	UserIcon,
} from "@heroicons/react/24/outline";
import {
	ColorType,
	CrosshairMode,
	HistogramSeries,
	createChart,
	type IChartApi,
	type ISeriesApi,
	type Time,
} from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth";
import { IconButton } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { getThemeColors, isDarkMode, utcToLocal } from "../../utils/chart";
import { formatUSD } from "../../utils/format";

interface ActivityPoint {
	time: number;
	volume: number;
	tokens: number;
	selfVolume?: number;
	selfTokens?: number;
}

const RANGE_OPTIONS = [
	{ label: "24h", hours: 24 },
	{ label: "3d", hours: 72 },
	{ label: "7d", hours: 168 },
] as const;

const CHART_HEIGHT = 240;

function fmtCompact(v: number): string {
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
	if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
	return Math.round(v).toLocaleString();
}

function ActivityBarChart({
	points,
	accessor,
	selfAccessor,
	color,
	selfColor = "#f59e0b80",
	label,
}: {
	points: ActivityPoint[];
	accessor: (p: ActivityPoint) => number;
	selfAccessor?: (p: ActivityPoint) => number;
	color: string;
	selfColor?: string;
	label: string;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const mainSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
	const selfSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
	const [hoverValue, setHoverValue] = useState<number | null>(null);

	const total = useMemo(
		() => points.reduce((sum, p) => sum + accessor(p), 0),
		[points, accessor],
	);

	useEffect(() => {
		if (!containerRef.current) return;

		const dark = isDarkMode();
		const colors = getThemeColors(dark);

		const chart = createChart(containerRef.current, {
			width: containerRef.current.clientWidth,
			height: CHART_HEIGHT,
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
			rightPriceScale: {
				borderColor: colors.borderColor,
				scaleMargins: { top: 0.1, bottom: 0.05 },
			},
			timeScale: {
				borderColor: colors.borderColor,
				timeVisible: true,
				secondsVisible: false,
			},
		});

		// Total series (behind) — shows full height in self color when stacked
		const totalSeries = chart.addSeries(HistogramSeries, {
			color: selfColor,
			priceFormat: {
				type: "custom" as const,
				formatter: fmtCompact,
			},
		});

		// Main series (in front) — shows non-self portion in primary color
		const mainSeries = chart.addSeries(HistogramSeries, {
			color,
			priceFormat: {
				type: "custom" as const,
				formatter: fmtCompact,
			},
		});

		chartRef.current = chart;
		mainSeriesRef.current = mainSeries;
		selfSeriesRef.current = totalSeries;

		chart.subscribeCrosshairMove((param) => {
			if (!param.time || !param.seriesData.size) {
				setHoverValue(null);
				return;
			}
			// Prefer the total series value for hover if stacked, else main
			const td = param.seriesData.get(totalSeries) as { value: number } | undefined;
			const md = param.seriesData.get(mainSeries) as { value: number } | undefined;
			setHoverValue(td?.value ?? md?.value ?? null);
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
			mainSeriesRef.current = null;
			selfSeriesRef.current = null;
		};
	}, [color, selfColor]);

	useEffect(() => {
		if (!mainSeriesRef.current || points.length === 0) return;

		if (selfAccessor && selfSeriesRef.current) {
			// Stacked mode: total behind, non-self in front
			const totalData = points.map((p) => ({
				time: utcToLocal(p.time) as Time,
				value: accessor(p),
			}));
			const nonSelfData = points.map((p) => ({
				time: utcToLocal(p.time) as Time,
				value: accessor(p) - (selfAccessor(p) || 0),
			}));
			selfSeriesRef.current.setData(totalData);
			mainSeriesRef.current.setData(nonSelfData);
		} else {
			// Single mode
			const data = points.map((p) => ({
				time: utcToLocal(p.time) as Time,
				value: accessor(p),
			}));
			mainSeriesRef.current.setData(data);
			selfSeriesRef.current?.setData([]);
		}
		chartRef.current?.timeScale().fitContent();
	}, [points, accessor, selfAccessor]);

	return (
		<div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
			<div className="flex items-baseline justify-between px-4 pt-4 pb-1">
				<span className="text-sm font-medium text-gray-500 dark:text-gray-400">
					{label}
				</span>
				<span className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
					{fmtCompact(hoverValue ?? total)}
					{hoverValue === null && (
						<span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
							total
						</span>
					)}
				</span>
			</div>
			<div ref={containerRef} className="px-1 pb-1" />
		</div>
	);
}

interface PlatformOverview {
	totalRevenue: number;
	totalConsumption: number;
	totalServiceFees: number;
	totalRequests: number;
	activeCredentials: number;
	registeredUsers: number;
	activeUsers: number;
}

function SyncButton({ label, endpoint }: { label: string; endpoint: string }) {
	const { getToken } = useAuth();
	const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
		"idle",
	);
	const [elapsed, setElapsed] = useState(0);

	const run = useCallback(async () => {
		setState("loading");
		try {
			const token = await getToken();
			const res = await fetch(endpoint, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const json = (await res.json()) as { elapsed?: number };
			setElapsed(json.elapsed ?? 0);
			setState("done");
			setTimeout(() => setState("idle"), 3000);
		} catch {
			setState("error");
			setTimeout(() => setState("idle"), 3000);
		}
	}, [endpoint, getToken]);

	return (
		<button
			type="button"
			onClick={run}
			disabled={state === "loading"}
			className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
		>
			<ArrowPathIcon
				className={`size-3.5 ${state === "loading" ? "animate-spin" : ""}`}
			/>
			{state === "loading"
				? "Syncing…"
				: state === "done"
					? `✓ ${elapsed}ms`
					: state === "error"
						? "✗ Failed"
						: label}
		</button>
	);
}

const volumeAccessor = (p: ActivityPoint) => p.volume;
const tokensAccessor = (p: ActivityPoint) => p.tokens;
const selfVolumeAccessor = (p: ActivityPoint) => p.selfVolume ?? 0;
const selfTokensAccessor = (p: ActivityPoint) => p.selfTokens ?? 0;

export function Overview() {
	const { t } = useTranslation();
	const { data, loading, refetch } = useFetch<PlatformOverview>(
		"/api/admin/overview",
	);
	const [activityRange, setActivityRange] = useState(24);
	const [selfFilter, setSelfFilter] = useState<"all" | "non-self" | "self">("all");
	const { data: activity } = useFetch<ActivityPoint[]>(
		`/api/admin/activity?hours=${activityRange}&self=${selfFilter}`,
	);

	const activityData = useMemo(() => activity ?? [], [activity]);

	const cards = data
		? [
				{
					name: t("admin.total_revenue"),
					value: formatUSD(data.totalRevenue),
					icon: BanknotesIcon,
				},
				{
					name: t("admin.total_consumption"),
					value: formatUSD(data.totalConsumption),
					icon: CreditCardIcon,
				},
				{
					name: t("admin.service_fees"),
					value: formatUSD(data.totalServiceFees),
					icon: ChartBarIcon,
				},
				{
					name: t("admin.total_requests"),
					value: data.totalRequests.toLocaleString(),
					icon: TableCellsIcon,
				},
				{
					name: t("admin.active_credentials"),
					value: data.activeCredentials.toString(),
					icon: ServerStackIcon,
				},
				{
					name: t("admin.registered_users"),
					value: data.registeredUsers.toString(),
					icon: UserGroupIcon,
				},
				{
					name: t("admin.active_users"),
					value: data.activeUsers.toString(),
					icon: UserIcon,
				},
			]
		: [];

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h3 className="text-base font-semibold text-gray-900 dark:text-white">
						{t("admin.overview")}
					</h3>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("admin.subtitle")}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<SyncButton label="Sync Models" endpoint="/api/admin/sync-models" />
					<SyncButton label="Sync Candles" endpoint="/api/admin/sync-candles" />
					<IconButton label="Refresh" size="md" onClick={refetch}>
						<ArrowPathIcon />
					</IconButton>
				</div>
			</div>

			{loading ? (
				<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
					{Array.from({ length: 7 }).map((_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							key={i}
							className="rounded-xl border border-gray-200 bg-white px-4 py-5 dark:border-white/10 dark:bg-white/5 animate-pulse"
						>
							<div className="h-4 w-20 rounded bg-gray-200 dark:bg-white/10" />
							<div className="mt-2 h-6 w-14 rounded bg-gray-200 dark:bg-white/10" />
						</div>
					))}
				</dl>
			) : (
				<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
					{cards.map((c) => (
						<div
							key={c.name}
							className="rounded-xl border border-gray-200 bg-white px-4 py-5 dark:border-white/10 dark:bg-white/5"
						>
							<dt className="flex items-center gap-2 truncate text-sm font-medium text-gray-500 dark:text-gray-400">
								<c.icon className="size-4 shrink-0" />
								{c.name}
							</dt>
							<dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
								{c.value}
							</dd>
						</div>
					))}
				</dl>
			)}

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
						{t("admin.activity")}
					</h4>
					<div className="flex items-center gap-3">
						<div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
							{(["all", "non-self", "self"] as const).map((opt) => (
								<button
									key={opt}
									type="button"
									onClick={() => setSelfFilter(opt)}
									className={`px-3 py-1 text-xs font-medium transition-colors ${
										selfFilter === opt
											? "bg-brand-500 text-white"
											: "bg-white text-gray-600 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10"
									}`}
								>
									{t(`admin.filter_${opt}`)}
								</button>
							))}
						</div>
						<div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
							{RANGE_OPTIONS.map((opt) => (
								<button
									key={opt.hours}
									type="button"
									onClick={() => setActivityRange(opt.hours)}
									className={`px-3 py-1 text-xs font-medium transition-colors ${
										activityRange === opt.hours
											? "bg-brand-500 text-white"
											: "bg-white text-gray-600 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10"
									}`}
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>
				</div>

				<ActivityBarChart
					points={activityData}
					accessor={volumeAccessor}
					selfAccessor={selfFilter === "all" ? selfVolumeAccessor : undefined}
					color="#6366f1"
					selfColor="#f59e0b80"
					label={t("admin.chart_volume")}
				/>
				<ActivityBarChart
					points={activityData}
					accessor={tokensAccessor}
					selfAccessor={selfFilter === "all" ? selfTokensAccessor : undefined}
					color="#f59e0b"
					selfColor="#ef444480"
					label={t("admin.chart_tokens")}
				/>
			</div>
		</div>
	);
}

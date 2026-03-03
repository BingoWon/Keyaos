import {
	ArrowPathIcon,
	BanknotesIcon,
	ChartBarIcon,
	CreditCardIcon,
	ServerStackIcon,
	TableCellsIcon,
	UserGroupIcon,
} from "@heroicons/react/24/outline";
import {
	AreaSeries,
	ColorType,
	CrosshairMode,
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

function ActivityAreaChart({
	points,
	accessor,
	color,
	label,
}: {
	points: ActivityPoint[];
	accessor: (p: ActivityPoint) => number;
	color: string;
	label: string;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
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

		const series = chart.addSeries(AreaSeries, {
			lineColor: color,
			topColor: `${color}30`,
			bottomColor: `${color}05`,
			lineWidth: 2,
			priceFormat: {
				type: "custom" as const,
				formatter: fmtCompact,
			},
		});

		chartRef.current = chart;
		seriesRef.current = series;

		chart.subscribeCrosshairMove((param) => {
			if (!param.time || !param.seriesData.size) {
				setHoverValue(null);
				return;
			}
			const d = param.seriesData.get(series) as { value: number } | undefined;
			if (d) setHoverValue(d.value);
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
	}, [color]);

	useEffect(() => {
		if (!seriesRef.current || points.length === 0) return;
		const data = points.map((p) => ({
			time: utcToLocal(p.time) as Time,
			value: accessor(p),
		}));
		seriesRef.current.setData(data);
		chartRef.current?.timeScale().fitContent();
	}, [points, accessor]);

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

export function Overview() {
	const { t } = useTranslation();
	const { data, loading, refetch } = useFetch<PlatformOverview>(
		"/api/admin/overview",
	);
	const [activityRange, setActivityRange] = useState(24);
	const { data: activity } = useFetch<ActivityPoint[]>(
		`/api/admin/activity?hours=${activityRange}`,
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
			]
		: [];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
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
				<dl className="grid grid-cols-6 gap-4">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							key={i}
							className="rounded-xl border border-gray-200 bg-white px-4 py-5 dark:border-white/10 dark:bg-white/5 animate-pulse"
						>
							<div className="h-4 w-20 rounded bg-gray-200 dark:bg-white/10" />
							<div className="mt-2 h-6 w-14 rounded bg-gray-200 dark:bg-white/10" />
						</div>
					))}
				</dl>
			) : (
				<dl className="grid grid-cols-6 gap-4">
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

				<ActivityAreaChart
					points={activityData}
					accessor={volumeAccessor}
					color="#6366f1"
					label={t("admin.chart_volume")}
				/>
				<ActivityAreaChart
					points={activityData}
					accessor={tokensAccessor}
					color="#f59e0b"
					label={t("admin.chart_tokens")}
				/>
			</div>
		</div>
	);
}

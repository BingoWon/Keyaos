import {
	ArrowPathIcon,
	BanknotesIcon,
	ChartBarIcon,
	CreditCardIcon,
	ServerStackIcon,
	TableCellsIcon,
	UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth";
import { PageLoader } from "../../components/PageLoader";
import { IconButton } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { formatUSD } from "../../utils/format";

interface ActivityPoint {
	time: number;
	volume: number;
	tokens: number;
	records: number;
}

const RANGE_OPTIONS = [
	{ label: "24h", hours: 24 },
	{ label: "3d", hours: 72 },
	{ label: "7d", hours: 168 },
] as const;

function MiniArea({
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
	if (points.length < 2) return null;

	const W = 320;
	const H = 80;
	const PAD = 1;
	const values = points.map(accessor);
	const max = Math.max(...values) || 1;

	const coords = values.map((v, i) => ({
		x: PAD + (i / (values.length - 1)) * (W - PAD * 2),
		y: PAD + (H - PAD * 2) - (v / max) * (H - PAD * 2),
	}));

	const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
	const area = `${coords[0].x.toFixed(1)},${H} ${line} ${coords[coords.length - 1].x.toFixed(1)},${H}`;

	const total = values.reduce((a, b) => a + b, 0);

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
			<div className="flex items-baseline justify-between mb-2">
				<span className="text-xs font-medium text-gray-500 dark:text-gray-400">
					{label}
				</span>
				<span className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
					{total.toLocaleString()}
				</span>
			</div>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full h-auto"
				preserveAspectRatio="none"
			>
				<polygon points={area} fill={color} opacity={0.15} />
				<polyline
					points={line}
					fill="none"
					stroke={color}
					strokeWidth={1.5}
					strokeLinejoin="round"
				/>
			</svg>
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
				<PageLoader />
			) : (
				<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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

			<div>
				<div className="flex items-center justify-between mb-3">
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
				<div className="grid gap-4 sm:grid-cols-3">
					<MiniArea
						points={activityData}
						accessor={(p) => p.volume}
						color="#6366f1"
						label={t("admin.chart_volume")}
					/>
					<MiniArea
						points={activityData}
						accessor={(p) => p.tokens}
						color="#f59e0b"
						label={t("admin.chart_tokens")}
					/>
					<MiniArea
						points={activityData}
						accessor={(p) => p.records}
						color="#22c55e"
						label={t("admin.chart_records")}
					/>
				</div>
			</div>
		</div>
	);
}

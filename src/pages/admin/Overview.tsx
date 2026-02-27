import {
	ArrowPathIcon,
	BanknotesIcon,
	ChartBarIcon,
	CreditCardIcon,
	ServerStackIcon,
	TableCellsIcon,
	UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth";
import { PageLoader } from "../../components/PageLoader";
import { IconButton } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { formatUSD } from "../../utils/format";

interface PlatformOverview {
	totalRevenue: number;
	totalConsumption: number;
	totalServiceFees: number;
	totalRequests: number;
	activeCredentials: number;
	registeredUsers: number;
}

function SyncButton({
	label,
	endpoint,
}: {
	label: string;
	endpoint: string;
}) {
	const { token } = useAuth();
	const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [elapsed, setElapsed] = useState(0);

	const run = useCallback(async () => {
		setState("loading");
		try {
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
	}, [endpoint, token]);

	return (
		<button
			type="button"
			onClick={run}
			disabled={state === "loading"}
			className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
		>
			<ArrowPathIcon className={`size-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
			{state === "loading" ? "Syncing…" : state === "done" ? `✓ ${elapsed}ms` : state === "error" ? "✗ Failed" : label}
		</button>
	);
}

export function Overview() {
	const { t } = useTranslation();
	const { data, loading, refetch } = useFetch<PlatformOverview>(
		"/api/admin/overview",
	);

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
		</div>
	);
}


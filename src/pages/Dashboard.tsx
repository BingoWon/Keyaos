import {
	BuildingOfficeIcon,
	CpuChipIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	DocumentCheckIcon,
} from "@heroicons/react/24/outline";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { isPlatform } from "../auth";
import { PageLoader } from "../components/PageLoader";
import { ProviderLogo } from "../components/ProviderLogo";
import { Badge } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import type { ModelEntry } from "../types/model";
import type { ProviderMeta } from "../types/provider";
import { formatPrice, formatSignedUSD, formatUSD } from "../utils/format";

interface Stats {
	total: number;
	activeProviders: number;
	dead: number;
	totalQuota: number;
}

interface UsageEntry {
	id: string;
	direction: "spent" | "earned" | "self";
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	netCredits: number;
	createdAt: number;
}

interface ModelGroup {
	id: string;
	displayName: string;
	providerCount: number;
	bestInputPrice: number;
}

interface ProviderGroup {
	meta: ProviderMeta;
	modelCount: number;
}

function aggregateTopModels(
	entries: ModelEntry[],
	limit: number,
): ModelGroup[] {
	const groups = new Map<
		string,
		{ name: string; providers: Set<string>; bestInput: number }
	>();
	for (const e of entries) {
		let g = groups.get(e.id);
		if (!g) {
			g = {
				name: e.name || e.id,
				providers: new Set(),
				bestInput: e.input_price ?? 0,
			};
			groups.set(e.id, g);
		}
		g.providers.add(e.owned_by);
		const ip = e.input_price ?? 0;
		if (ip < g.bestInput) g.bestInput = ip;
	}
	return [...groups.entries()]
		.map(([id, g]) => ({
			id,
			displayName: g.name,
			providerCount: g.providers.size,
			bestInputPrice: g.bestInput,
		}))
		.sort((a, b) => b.providerCount - a.providerCount)
		.slice(0, limit);
}

function aggregateProviders(
	entries: ModelEntry[],
	metas: ProviderMeta[],
): ProviderGroup[] {
	const counts = new Map<string, number>();
	for (const e of entries) {
		counts.set(e.owned_by, (counts.get(e.owned_by) ?? 0) + 1);
	}
	const metaMap = new Map(metas.map((m) => [m.id, m]));
	return [...counts.entries()]
		.map(([id, count]) => ({
			meta: metaMap.get(id),
			modelCount: count,
		}))
		.filter((g): g is ProviderGroup => !!g.meta)
		.sort((a, b) => b.modelCount - a.modelCount);
}

export function Dashboard() {
	const { t } = useTranslation();
	const formatDateTime = useFormatDateTime();
	const { data: stats, loading: statsLoading } =
		useFetch<Stats>("/api/pool/stats");
	const { data: wallet } = useFetch<{ balance: number }>(
		"/api/billing/balance",
		{ skip: !isPlatform },
	);
	const { data: rawModels, loading: modelsLoading } =
		useFetch<ModelEntry[]>("/v1/models");
	const { data: providersData } = useFetch<ProviderMeta[]>("/api/providers");
	const { data: recentUsage } = useFetch<UsageEntry[]>("/api/usage?limit=5", {
		skip: !isPlatform,
	});

	const uniqueModelCount = useMemo(() => {
		if (!rawModels) return 0;
		return new Set(rawModels.map((m) => m.id)).size;
	}, [rawModels]);

	const topModels = useMemo(
		() => aggregateTopModels(rawModels ?? [], 8),
		[rawModels],
	);

	const providerGroups = useMemo(
		() => aggregateProviders(rawModels ?? [], providersData ?? []),
		[rawModels, providersData],
	);

	const loading = statsLoading || modelsLoading;

	if (loading) {
		return (
			<div>
				<h3 className="text-base font-semibold text-gray-900 dark:text-white">
					{t("dashboard.title")}
				</h3>
				<div className="mt-5">
					<PageLoader />
				</div>
			</div>
		);
	}

	const statCards = [
		{
			name: t("dashboard.models_count"),
			stat: uniqueModelCount,
			icon: CpuChipIcon,
			href: "/dashboard/models",
		},
		{
			name: t("dashboard.providers_count"),
			stat: providerGroups.length,
			icon: BuildingOfficeIcon,
			href: "/dashboard/providers",
		},
		{
			name: t("dashboard.active_credentials"),
			stat: stats ? stats.total - stats.dead : "-",
			icon: DocumentCheckIcon,
			href: "/dashboard/credentials",
		},
		{
			name: t("dashboard.total_quota"),
			stat: stats ? formatUSD(stats.totalQuota) : "-",
			icon: CurrencyDollarIcon,
			href: "/dashboard/credentials",
		},
		...(isPlatform
			? [
					{
						name: t("dashboard.wallet_balance"),
						stat: wallet ? formatUSD(wallet.balance) : "-",
						icon: CreditCardIcon,
						href: "/dashboard/billing",
					},
				]
			: []),
	];

	return (
		<div className="space-y-6">
			<h3 className="text-base font-semibold text-gray-900 dark:text-white">
				{t("dashboard.title")}
			</h3>

			{/* Stats Cards */}
			<dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{statCards.map((item) => (
					<Link
						key={item.name}
						to={item.href}
						className="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-white/5 transition-colors hover:border-brand-300 dark:hover:border-brand-500/30 group"
					>
						<dt className="flex items-center gap-3">
							<div className="rounded-lg bg-brand-500/10 p-2.5 dark:bg-brand-500/15">
								<item.icon
									aria-hidden="true"
									className="size-5 text-brand-500"
								/>
							</div>
							<p className="truncate text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
								{item.name}
							</p>
						</dt>
						<dd className="mt-3 ml-[3.25rem]">
							<p className="text-2xl font-semibold text-gray-900 dark:text-white">
								{item.stat}
							</p>
						</dd>
					</Link>
				))}
			</dl>

			{/* Providers Grid */}
			{providerGroups.length > 0 && (
				<div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
					<div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/5">
						<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
							{t("dashboard.providers_title")}
						</h4>
						<Link
							to="/dashboard/providers"
							className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
						>
							{t("dashboard.view_all")}
						</Link>
					</div>
					<div className="px-5 py-4 flex flex-wrap gap-2.5">
						{providerGroups.map((g) => (
							<Link
								key={g.meta.id}
								to="/dashboard/providers"
								className="inline-flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 dark:border-white/5 dark:bg-white/[0.02] hover:border-brand-200 dark:hover:border-brand-500/20 transition-colors"
							>
								<ProviderLogo
									src={g.meta.logoUrl}
									name={g.meta.name}
									size={18}
								/>
								<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
									{g.meta.name}
								</span>
								<Badge variant="brand">{g.modelCount}</Badge>
							</Link>
						))}
					</div>
				</div>
			)}

			{/* Top Models */}
			{topModels.length > 0 && (
				<div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
					<div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/5">
						<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
							{t("dashboard.top_models")}
						</h4>
						<Link
							to="/dashboard/models"
							className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
						>
							{t("dashboard.view_all")}
						</Link>
					</div>
					<div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
						{topModels.map((m) => (
							<Link
								key={m.id}
								to="/dashboard/models"
								className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors"
							>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium text-gray-900 dark:text-white truncate">
										{m.displayName}
									</p>
									<code className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate">
										{m.id}
									</code>
								</div>
								<div className="shrink-0 flex items-center gap-1.5">
									<Badge variant="brand">{m.providerCount}</Badge>
									<Badge variant="success">
										{formatPrice(m.bestInputPrice)}
									</Badge>
								</div>
							</Link>
						))}
					</div>
				</div>
			)}

			{/* Recent Activity (platform only) */}
			{isPlatform && recentUsage && recentUsage.length > 0 && (
				<div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
					<div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/5">
						<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
							{t("dashboard.recent_activity")}
						</h4>
						<Link
							to="/dashboard/usage"
							className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
						>
							{t("dashboard.view_all")}
						</Link>
					</div>
					<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
						<thead>
							<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
								<th className="py-2.5 pl-5 pr-2">{t("usage.time")}</th>
								<th className="px-2">{t("usage.model")}</th>
								<th className="px-2">{t("usage.provider")}</th>
								<th className="py-2.5 pl-2 pr-5 text-right">
									{t("usage.credits")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
							{recentUsage.map((tx) => (
								<tr key={tx.id}>
									<td className="py-2.5 pl-5 pr-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
										{formatDateTime(tx.createdAt)}
									</td>
									<td className="px-2 py-2.5 text-sm text-gray-900 dark:text-white truncate max-w-[200px]">
										{tx.model}
									</td>
									<td className="px-2 py-2.5 text-sm text-gray-500 dark:text-gray-400">
										{tx.provider}
									</td>
									<td
										className={`py-2.5 pl-2 pr-5 text-sm text-right font-medium whitespace-nowrap ${
											tx.netCredits > 0
												? "text-green-600 dark:text-green-400"
												: tx.netCredits < 0
													? "text-red-600 dark:text-red-400"
													: "text-gray-400 dark:text-gray-500"
										}`}
									>
										{formatSignedUSD(tx.netCredits)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

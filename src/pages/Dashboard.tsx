import {
	ArrowTrendingUpIcon,
	BoltIcon,
	CreditCardIcon,
	DocumentCheckIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { isPlatform } from "../auth";
import { CopyButton } from "../components/CopyButton";
import { DirectionBadge } from "../components/DirectionBadge";
import { ModalityBadges } from "../components/Modalities";
import { OrgLogo } from "../components/OrgLogo";
import { ProviderGrid } from "../components/ProviderGrid";
import { ProviderLogoGroup } from "../components/ProviderLogo";
import { RefreshControl } from "../components/RefreshControl";
import { Sparkline, type SparklineData } from "../components/Sparkline";
import { Badge, DualPrice } from "../components/ui";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import type { LogEntry } from "../types/log";
import type { ModelEntry } from "../types/model";
import type { ProviderMeta } from "../types/provider";
import { TOKENS } from "../utils/colors";
import {
	formatContext,
	formatRelativeTime,
	formatSignedUSD,
	formatUSD,
} from "../utils/format";
import { aggregateModels } from "../utils/models";
import { aggregateProviders } from "../utils/providers";

const LATEST_MODELS_LIMIT = 8;

interface PoolStats {
	healthyCredentials: number;
	earnings24h: number;
	apiCalls24h: number;
}

export function Dashboard() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const formatDateTime = useFormatDateTime();

	const {
		data: poolStats,
		loading: statsLoading,
		refetch: refetchStats,
	} = useFetch<PoolStats>("/api/pool/stats");
	const {
		data: balance,
		loading: balanceLoading,
		refetch: refetchBalance,
	} = useFetch<{ balance: number }>("/api/credits/balance", {
		skip: !isPlatform,
	});
	const {
		data: rawModels,
		loading: modelsLoading,
		refetch: refetchModels,
	} = useFetch<ModelEntry[]>("/api/models", { requireAuth: false });
	const {
		data: providersData,
		loading: providersLoading,
		refetch: refetchProviders,
	} = useFetch<ProviderMeta[]>("/api/providers", {
		requireAuth: false,
	});
	const {
		data: recentLogsResult,
		loading: logsLoading,
		refetch: refetchLogs,
	} = useFetch<{
		items: LogEntry[];
		total: number;
	}>("/api/logs?page=1&limit=10", {
		skip: !isPlatform,
	});
	const recentLogs = recentLogsResult?.items;
	const {
		data: inputSparks,
		loading: sparksLoading,
		refetch: refetchSparks,
	} = useFetch<Record<string, SparklineData>>("/api/sparklines/model:input", {
		requireAuth: false,
	});

	const isRefreshing =
		statsLoading ||
		(isPlatform ? balanceLoading : false) ||
		modelsLoading ||
		providersLoading ||
		logsLoading ||
		sparksLoading;

	const handleRefresh = useCallback(() => {
		refetchStats();
		if (isPlatform) refetchBalance();
		refetchModels();
		refetchProviders();
		if (isPlatform) refetchLogs();
		refetchSparks();
	}, [
		refetchStats,
		refetchBalance,
		refetchModels,
		refetchProviders,
		refetchLogs,
		refetchSparks,
	]);

	const lastUpdated = useAutoRefresh(handleRefresh, rawModels, 600_000);

	const uniqueModelCount = useMemo(() => {
		if (!rawModels) return 0;
		return new Set(rawModels.map((m) => m.id)).size;
	}, [rawModels]);

	const allGroups = useMemo(
		() => aggregateModels(rawModels ?? []),
		[rawModels],
	);
	const latestModels = allGroups.slice(0, LATEST_MODELS_LIMIT);

	const providerGroups = useMemo(
		() => aggregateProviders(rawModels ?? [], providersData ?? []),
		[rawModels, providersData],
	);

	const providerMap = useMemo(
		() => new Map((providersData ?? []).map((m) => [m.id, m])),
		[providersData],
	);

	const statCards = [
		...(isPlatform
			? [
					{
						name: t("dashboard.credits_balance"),
						stat: balance ? formatUSD(balance.balance) : null,
						icon: CreditCardIcon,
						href: "/dashboard/credits",
					},
				]
			: []),
		{
			name: t("dashboard.credits_earnings"),
			stat: poolStats ? formatUSD(poolStats.earnings24h) : null,
			icon: ArrowTrendingUpIcon,
			href: "/dashboard/logs",
		},
		{
			name: t("dashboard.api_calls"),
			stat: poolStats ? poolStats.apiCalls24h.toLocaleString() : null,
			icon: BoltIcon,
			href: "/dashboard/logs",
		},
		{
			name: t("dashboard.healthy_credentials"),
			stat: poolStats ? poolStats.healthyCredentials : null,
			icon: DocumentCheckIcon,
			href: "/dashboard/byok",
		},
	];

	return (
		<div className="space-y-6">
			<div className="sm:flex sm:items-center">
				<div className="sm:flex-auto">
					<h1 className="text-xl font-semibold text-gray-900 dark:text-white">
						{t("dashboard.title")}
					</h1>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("dashboard.subtitle")}
					</p>
				</div>
				<div className="mt-4 sm:mt-0 flex items-end gap-3">
					<RefreshControl
						loading={isRefreshing}
						lastUpdated={lastUpdated}
						onRefresh={handleRefresh}
					/>
				</div>
			</div>

			{/* Stats Cards */}
			<dl
				className={`grid gap-4 grid-cols-2 ${isPlatform ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
			>
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
							{item.stat != null ? (
								<p className="text-2xl font-semibold text-gray-900 dark:text-white">
									{item.stat}
								</p>
							) : (
								<div className="h-8 w-16 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
							)}
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
							<span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
								{providerGroups.length}
							</span>
						</h4>
						<Link
							to="/providers"
							className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
						>
							{t("dashboard.view_all")}
						</Link>
					</div>
					<div className="px-5 py-4">
						<ProviderGrid groups={providerGroups} />
					</div>
				</div>
			)}

			{/* Latest Models */}
			{modelsLoading ? (
				<div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5 overflow-x-auto">
					<div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/5">
						<div className="h-4 w-28 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
						<div className="h-3 w-16 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
					</div>
					<table className="min-w-full">
						<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
							{Array.from({ length: 4 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
								<tr key={i}>
									<td className="py-2.5 pl-5 pr-2">
										<div className="space-y-1.5">
											<div className="h-4 w-36 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
											<div className="h-3 w-52 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
										</div>
									</td>
									<td className="px-2 py-2.5 hidden lg:table-cell">
										<div className="flex gap-1">
											<div className="h-5 w-10 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
											<div className="h-5 w-10 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
										</div>
									</td>
									<td className="px-2 py-2.5 hidden md:table-cell">
										<div className="h-7 w-24 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
									</td>
									<td className="px-2 py-2.5 text-right">
										<div className="h-4 w-16 rounded bg-gray-100 dark:bg-white/5 animate-pulse ml-auto" />
									</td>
									<td className="px-2 py-2.5 text-right">
										<div className="h-4 w-16 rounded bg-gray-100 dark:bg-white/5 animate-pulse ml-auto" />
									</td>
									<td className="px-2 py-2.5 hidden sm:table-cell text-right">
										<div className="h-4 w-12 rounded bg-gray-100 dark:bg-white/5 animate-pulse ml-auto" />
									</td>
									<td className="py-2.5 pl-2 pr-5 text-right">
										<div className="h-5 w-7 rounded bg-gray-100 dark:bg-white/5 animate-pulse ml-auto" />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				latestModels.length > 0 && (
					<div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5 overflow-x-auto">
						<div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/5">
							<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
								{t("dashboard.latest_models")}
								<span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
									{uniqueModelCount}
								</span>
							</h4>
							<Link
								to="/models"
								className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
							>
								{t("dashboard.view_all")}
							</Link>
						</div>
						<table className="min-w-full">
							<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
								{latestModels.map((g) => {
									const best = g.providers[0];
									const maxCtx = Math.max(
										...g.providers.map((p) => p.contextLength),
									);
									const spark = inputSparks?.[g.id];
									return (
										<tr
											key={g.id}
											onClick={(e) => {
												if ((e.target as HTMLElement).closest("a,button"))
													return;
												navigate(`/${g.id}`);
											}}
											className="even:bg-gray-50/50 hover:bg-gray-100/60 dark:even:bg-white/[0.015] dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
										>
											<td className="py-2.5 pl-5 pr-2">
												<div className="min-w-0">
													<Link
														to={`/${g.id}`}
														className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400 transition-colors whitespace-nowrap"
													>
														<OrgLogo modelId={g.id} size={16} />
														{g.displayName}
													</Link>
													<div className="hidden items-center gap-1.5 mt-0.5 sm:flex">
														<code className="text-xs font-mono text-gray-500 dark:text-gray-400">
															{g.id}
														</code>
														<CopyButton text={g.id} />
														{g.createdAt > 0 && (
															<Badge variant="warning">
																{formatRelativeTime(g.createdAt, i18n.language)}
															</Badge>
														)}
													</div>
												</div>
											</td>
											<td className="px-2 py-2.5 hidden lg:table-cell">
												<ModalityBadges
													input={g.inputModalities}
													output={g.outputModalities}
												/>
											</td>
											<td className="px-2 py-2.5 hidden md:table-cell">
												{spark && <Sparkline data={spark} className="h-7" />}
											</td>
											<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
												<DualPrice
													original={best.inputPrice}
													platform={best.platformInputPrice}
												/>
											</td>
											<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
												<DualPrice
													original={best.outputPrice}
													platform={best.platformOutputPrice}
												/>
											</td>
											<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400 hidden sm:table-cell whitespace-nowrap">
												{maxCtx > 0 ? formatContext(maxCtx) : "—"}
											</td>
											<td className="py-2.5 pl-2 pr-5">
												<div className="flex justify-end">
													<ProviderLogoGroup
														providers={g.providers}
														providerMap={providerMap}
													/>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)
			)}

			{/* Recent Activity (platform only) */}
			{isPlatform && recentLogs && recentLogs.length > 0 && (
				<div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
					<div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/5">
						<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
							{t("dashboard.recent_activity")}
						</h4>
						<Link
							to="/dashboard/logs"
							className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
						>
							{t("dashboard.view_all")}
						</Link>
					</div>
					<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
						<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
							{recentLogs.map((tx) => (
								<tr
									key={tx.id}
									className="even:bg-gray-50/50 dark:even:bg-white/[0.015]"
								>
									<td className="whitespace-nowrap py-2.5 pl-4 pr-2 text-sm text-gray-500 dark:text-gray-400 sm:pl-5">
										{formatDateTime(tx.createdAt)}
									</td>
									<td className="whitespace-nowrap px-2 py-2.5">
										<DirectionBadge direction={tx.direction} />
									</td>
									<td className="whitespace-nowrap px-2 py-2.5 text-sm font-medium text-gray-900 dark:text-white">
										<span className="inline-flex items-center gap-2">
											<OrgLogo modelId={tx.model_id} size={16} />
											{tx.model_id}
										</span>
									</td>
									<td className="whitespace-nowrap px-2 py-2.5 text-sm text-gray-500 dark:text-gray-400">
										{tx.provider_id}
									</td>
									<td className="whitespace-nowrap px-2 py-2.5 text-sm text-right text-gray-500 dark:text-gray-400">
										{tx.inputTokens.toLocaleString()}
									</td>
									<td className="whitespace-nowrap px-2 py-2.5 text-sm text-right text-gray-500 dark:text-gray-400">
										{tx.outputTokens.toLocaleString()}
									</td>
									<td
										className={`whitespace-nowrap py-2.5 pl-2 pr-4 text-sm text-right font-medium sm:pr-5 ${
											tx.netCredits > 0
												? TOKENS.green.text
												: tx.netCredits < 0
													? TOKENS.red.text
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

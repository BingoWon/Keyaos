import {
	ArrowTrendingUpIcon,
	BoltIcon,
	CreditCardIcon,
	DocumentCheckIcon,
} from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { isPlatform } from "../auth";
import { CopyButton } from "../components/CopyButton";
import { ModalityBadges } from "../components/Modalities";
import { ModelDetailModal } from "../components/ModelDetailModal";
import { PageLoader } from "../components/PageLoader";
import { ProviderDetailModal } from "../components/ProviderDetailModal";
import { ProviderLogo } from "../components/ProviderLogo";
import { Sparkline, type SparklineData } from "../components/Sparkline";
import { Badge, DualPrice } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import type { ModelEntry } from "../types/model";
import type { ProviderMeta } from "../types/provider";
import {
	formatContext,
	formatRelativeTime,
	formatSignedUSD,
	formatUSD,
} from "../utils/format";
import { aggregateModels, type ModelGroup } from "../utils/models";
import { aggregateProviders, type ProviderGroup } from "../utils/providers";

const LATEST_MODELS_LIMIT = 8;

interface PoolStats {
	healthyCredentials: number;
	earnings24h: number;
	apiCalls24h: number;
}

interface LogEntry {
	id: string;
	direction: "spent" | "earned" | "self";
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	netCredits: number;
	createdAt: number;
}

export function Dashboard() {
	const { t } = useTranslation();
	const formatDateTime = useFormatDateTime();
	const { data: poolStats, loading: statsLoading } =
		useFetch<PoolStats>("/api/pool/stats");
	const { data: balance } = useFetch<{ balance: number }>(
		"/api/credits/balance",
		{ skip: !isPlatform },
	);
	const { data: rawModels, loading: modelsLoading } =
		useFetch<ModelEntry[]>("/api/models");
	const { data: providersData } = useFetch<ProviderMeta[]>("/api/providers");
	const { data: recentLogs } = useFetch<LogEntry[]>("/api/logs?limit=5", {
		skip: !isPlatform,
	});
	const { data: inputSparks } = useFetch<Record<string, SparklineData>>(
		"/api/sparklines/model:input",
	);

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

	const [selectedModel, setSelectedModel] = useState<ModelGroup | null>(null);
	const [selectedProvider, setSelectedProvider] =
		useState<ProviderGroup | null>(null);

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
		...(isPlatform
			? [
					{
						name: t("dashboard.credits_balance"),
						stat: balance ? formatUSD(balance.balance) : "-",
						icon: CreditCardIcon,
						href: "/dashboard/credits",
					},
				]
			: []),
		{
			name: t("dashboard.credits_earnings"),
			stat: poolStats ? formatUSD(poolStats.earnings24h) : "-",
			icon: ArrowTrendingUpIcon,
			href: "/dashboard/logs",
		},
		{
			name: t("dashboard.api_calls"),
			stat: poolStats ? poolStats.apiCalls24h.toLocaleString() : "-",
			icon: BoltIcon,
			href: "/dashboard/logs",
		},
		{
			name: t("dashboard.healthy_credentials"),
			stat: poolStats ? poolStats.healthyCredentials : "-",
			icon: DocumentCheckIcon,
			href: "/dashboard/byok",
		},
	];

	return (
		<div className="space-y-6">
			<h3 className="text-base font-semibold text-gray-900 dark:text-white">
				{t("dashboard.title")}
			</h3>

			{/* Stats Cards */}
			<dl
				className={`grid gap-4 ${isPlatform ? "grid-cols-4" : "grid-cols-3"}`}
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
							<span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
								{providerGroups.length}
							</span>
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
							<button
								key={g.provider.id}
								type="button"
								onClick={() => setSelectedProvider(g)}
								className="inline-flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 dark:border-white/5 dark:bg-white/[0.02] hover:border-brand-200 dark:hover:border-brand-500/20 transition-colors cursor-pointer"
							>
								<ProviderLogo
									src={g.provider.logoUrl}
									name={g.provider.name}
									size={18}
								/>
								<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
									{g.provider.name}
								</span>
								<Badge variant="brand">{g.models.length}</Badge>
							</button>
						))}
					</div>
				</div>
			)}

			{/* Latest Models */}
			{latestModels.length > 0 && (
				<div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5 overflow-hidden">
					<div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/5">
						<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
							{t("dashboard.latest_models")}
							<span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
								{uniqueModelCount}
							</span>
						</h4>
						<Link
							to="/dashboard/models"
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
										onClick={() => setSelectedModel(g)}
										className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
									>
										<td className="py-2.5 pl-5 pr-2">
											<div className="min-w-0">
												<div className="text-sm font-semibold text-gray-900 dark:text-white">
													{g.displayName}
												</div>
												<div className="flex items-center gap-1.5 mt-0.5">
													<code className="text-xs font-mono text-gray-500 dark:text-gray-400">
														{g.id}
													</code>
													<CopyButton text={g.id} />
													{g.createdAt > 0 && (
														<Badge variant="warning">
															{formatRelativeTime(g.createdAt)}
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
											<div className="flex items-center justify-end gap-1">
												<span className="hidden sm:inline-flex items-center gap-0.5">
													{g.providers.slice(0, 4).map((p) => {
														const meta = providerMap.get(p.provider);
														return meta ? (
															<ProviderLogo
																key={p.provider}
																src={meta.logoUrl}
																name={meta.name}
																size={16}
															/>
														) : null;
													})}
												</span>
												<Badge variant="brand">{g.providers.length}</Badge>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{/* Recent Activity (platform only) */}
			{isPlatform && recentLogs && recentLogs.length > 0 && (
				<div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
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
						<thead>
							<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
								<th className="py-2.5 pl-5 pr-2">{t("logs.time")}</th>
								<th className="px-2">{t("logs.model")}</th>
								<th className="px-2">{t("logs.provider")}</th>
								<th className="py-2.5 pl-2 pr-5 text-right">
									{t("logs.credits")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
							{recentLogs.map((tx) => (
								<tr key={tx.id}>
									<td className="py-2.5 pl-5 pr-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
										{formatDateTime(tx.createdAt)}
									</td>
									<td className="px-2 py-2.5 text-sm text-gray-900 dark:text-white">
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

			{selectedModel && (
				<ModelDetailModal
					group={selectedModel}
					providerMap={providerMap}
					onClose={() => setSelectedModel(null)}
				/>
			)}
			{selectedProvider && (
				<ProviderDetailModal
					group={selectedProvider}
					onClose={() => setSelectedProvider(null)}
				/>
			)}
		</div>
	);
}

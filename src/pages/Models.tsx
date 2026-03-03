import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "../components/CopyButton";
import { ModalityBadges } from "../components/Modalities";
import { Pagination } from "../components/Pagination";
import { ProviderLogo } from "../components/ProviderLogo";
import { SearchBar } from "../components/SearchBar";
import {
	PriceRange,
	Sparkline,
	type SparklineData,
} from "../components/Sparkline";
import { Badge, Button, DualPrice } from "../components/ui";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { useFetch } from "../hooks/useFetch";
import type { ModelEntry } from "../types/model";
import type { ProviderMeta } from "../types/provider";
import {
	formatContext,
	formatPrice,
	formatRelativeTime,
	formatTimestamp,
} from "../utils/format";
import { aggregateModels, type ModelGroup } from "../utils/models";

const ModelDetailModal = lazy(() =>
	import("../components/ModelDetailModal").then((m) => ({
		default: m.ModelDetailModal,
	})),
);

const DEFAULT_PAGE_SIZE = 30;

export function Models() {
	const { t, i18n } = useTranslation();
	const {
		data: raw,
		loading,
		error,
		refetch: refetchModels,
	} = useFetch<ModelEntry[]>("/api/models", { requireAuth: false });
	const { data: providersData } = useFetch<ProviderMeta[]>("/api/providers", {
		requireAuth: false,
	});
	const { data: inputSparks, refetch: refetchSparks } = useFetch<
		Record<string, SparklineData>
	>("/api/sparklines/model:input", { requireAuth: false });

	const refetch = useCallback(() => {
		refetchModels();
		refetchSparks();
	}, [refetchModels, refetchSparks]);

	const lastUpdated = useAutoRefresh(refetch, raw);

	const providerMap = useMemo(() => {
		const m = new Map<string, ProviderMeta>();
		for (const p of providersData ?? []) m.set(p.id, p);
		return m;
	}, [providersData]);

	const groups = useMemo(() => aggregateModels(raw ?? []), [raw]);

	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
	const [selected, setSelected] = useState<ModelGroup | null>(null);

	const filtered = useMemo(() => {
		if (!query.trim()) return groups;
		const q = query.toLowerCase();
		return groups.filter(
			(g) =>
				g.id.toLowerCase().includes(q) ||
				g.displayName.toLowerCase().includes(q),
		);
	}, [groups, query]);

	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

	const handleSearch = (v: string) => {
		setQuery(v);
		setPage(1);
	};

	const handlePageSizeChange = (size: number) => {
		setPageSize(size);
		setPage(1);
	};

	if (error) {
		return (
			<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-900/20 dark:text-red-400">
				Failed to load models: {error.message}
			</div>
		);
	}

	return (
		<div>
			<div className="sm:flex sm:items-end">
				<div className="sm:flex-auto">
					<h3 className="text-base font-semibold text-gray-900 dark:text-white">
						{t("models.title")}
					</h3>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("models.subtitle")}
					</p>
				</div>
				<div className="mt-4 sm:mt-0 flex items-end gap-3">
					{lastUpdated && (
						<span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0 mb-1">
							{t("common_updated_at", { time: formatTimestamp(lastUpdated) })}
						</span>
					)}
					<Button onClick={refetch} className="shrink-0">
						<ArrowPathIcon
							className={`-ml-0.5 size-5 ${loading ? "animate-spin" : ""}`}
						/>
						{t("common_refresh")}
					</Button>
					{raw && groups.length > 0 && (
						<SearchBar
							value={query}
							onChange={handleSearch}
							placeholder={t("models.search_placeholder")}
						/>
					)}
				</div>
			</div>

			{!raw && loading ? (
				<div className="mt-5 rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5 overflow-hidden">
					<div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
						{Array.from({ length: 8 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							<div key={i} className="flex items-center gap-4 px-5 py-3.5">
								<div className="flex-1 space-y-1.5">
									<div className="h-4 w-40 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
									<div className="h-3 w-56 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
								</div>
								<div className="h-4 w-16 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
								<div className="h-4 w-16 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
							</div>
						))}
					</div>
				</div>
			) : groups.length === 0 ? (
				<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{t("models.no_data")}
				</p>
			) : (
				<>
					<div className="mt-5 rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5 overflow-hidden">
						<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
							<thead>
								<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
									<th className="py-2.5 pl-4 pr-2 sm:pl-5">
										{t("models.model")}
									</th>
									<th className="px-2 hidden lg:table-cell">Modalities</th>
									<th className="px-2 hidden md:table-cell">24h Chart</th>
									<th className="px-2 hidden md:table-cell">24h Range</th>
									<th className="px-2 text-right">Input /1M</th>
									<th className="px-2 text-right">Output /1M</th>
									<th className="px-2 text-right hidden sm:table-cell">
										{t("models.context")}
									</th>
									<th className="py-2.5 pl-2 pr-4 sm:pr-5 text-right">
										Providers
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
								{paged.map((g) => {
									const best = g.providers[0];
									const maxCtx = Math.max(
										...g.providers.map((p) => p.contextLength),
									);
									const spark = inputSparks?.[g.id];
									return (
										<tr
											key={g.id}
											onClick={() => setSelected(g)}
											className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
										>
											<td className="py-2.5 pl-4 pr-2 sm:pl-5">
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
												{spark && (
													<div className="w-[clamp(80px,11vw,160px)]">
														<Sparkline data={spark} />
													</div>
												)}
											</td>
											<td className="px-2 py-2.5 hidden md:table-cell whitespace-nowrap">
												{spark && (
													<div className="w-[clamp(80px,11vw,160px)]">
														<PriceRange data={spark} format={formatPrice} />
													</div>
												)}
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
											<td className="py-2.5 pl-2 pr-4 sm:pr-5">
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

					<div className="mt-3 flex items-center justify-between">
						<span className="text-xs text-gray-500 dark:text-gray-400">
							{query
								? t("models.result_count", {
										count: filtered.length,
										total: groups.length,
									})
								: t("models.total_count", { count: filtered.length })}
						</span>
						<Pagination
							page={safePage}
							totalPages={totalPages}
							onChange={setPage}
							pageSize={pageSize}
							onPageSizeChange={handlePageSizeChange}
						/>
					</div>
				</>
			)}

			{selected && (
				<Suspense fallback={null}>
					<ModelDetailModal
						group={selected}
						providerMap={providerMap}
						onClose={() => setSelected(null)}
					/>
				</Suspense>
			)}
		</div>
	);
}

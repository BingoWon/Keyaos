import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ModelType } from "../../worker/core/db/schema";
import { CopyButton } from "../components/CopyButton";
import { ModalityBadges } from "../components/Modalities";
import {
	applyFilters,
	EMPTY_FILTERS,
	isFiltersEmpty,
	ModelFilters,
	type ModelFiltersState,
} from "../components/ModelFilters";
import { OrgLogo } from "../components/OrgLogo";
import { Pagination } from "../components/Pagination";
import { ProviderLogoGroup } from "../components/ProviderLogo";
import { RefreshControl } from "../components/RefreshControl";
import { SearchBar } from "../components/SearchBar";
import {
	PriceRange,
	Sparkline,
	type SparklineData,
} from "../components/Sparkline";
import { Badge, DualPrice } from "../components/ui";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { useFetch } from "../hooks/useFetch";
import type { ModelEntry } from "../types/model";
import type { ProviderMeta } from "../types/provider";
import { TOKENS } from "../utils/colors";
import {
	formatContext,
	formatPrice,
	formatRelativeTime,
} from "../utils/format";
import { aggregateModels } from "../utils/models";

type TypeTab = "all" | ModelType;

const DEFAULT_PAGE_SIZE = 20;

export function Models() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
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

	const lastUpdated = useAutoRefresh(refetch, raw, 600_000);

	const providerMap = useMemo(() => {
		const m = new Map<string, ProviderMeta>();
		for (const p of providersData ?? []) m.set(p.id, p);
		return m;
	}, [providersData]);

	const groups = useMemo(() => aggregateModels(raw ?? []), [raw]);

	// ─── Search ──────────────────────────────────────────
	const [searchParams] = useSearchParams();
	const urlQ = searchParams.get("q");
	const [query, setQuery] = useState(() => urlQ ?? "");

	useEffect(() => {
		if (urlQ !== null) {
			setQuery(urlQ);
			setPage(1);
		}
	}, [urlQ]);

	// ─── Type tab ────────────────────────────────────────
	const [typeTab, setTypeTab] = useState<TypeTab>("all");

	const typeCounts = useMemo(() => {
		let chat = 0;
		let embedding = 0;
		for (const g of groups) {
			if (g.type === "embedding") embedding++;
			else chat++;
		}
		return { chat, embedding, all: chat + embedding };
	}, [groups]);

	// ─── Filters ─────────────────────────────────────────
	const [filters, setFilters] = useState<ModelFiltersState>(EMPTY_FILTERS);

	const handleFiltersChange = useCallback((f: ModelFiltersState) => {
		setFilters(f);
		setPage(1);
	}, []);

	// ─── Pagination ──────────────────────────────────────
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

	// ─── Derived data ────────────────────────────────────
	const typed = useMemo(
		() =>
			typeTab === "all" ? groups : groups.filter((g) => g.type === typeTab),
		[groups, typeTab],
	);

	const searched = useMemo(() => {
		if (!query.trim()) return typed;
		const q = query.toLowerCase();
		return typed.filter(
			(g) =>
				g.id.toLowerCase().includes(q) ||
				g.displayName.toLowerCase().includes(q),
		);
	}, [typed, query]);

	const filtered = useMemo(
		() =>
			isFiltersEmpty(filters) ? searched : applyFilters(searched, filters),
		[searched, filters],
	);

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
			<div className={`rounded-xl border p-4 text-sm ${TOKENS.red.outline}`}>
				Failed to load models: {error.message}
			</div>
		);
	}

	const hasData = raw && groups.length > 0;
	const filtersActive = !isFiltersEmpty(filters);

	return (
		<div>
			{/* Header */}
			<div className="sm:flex sm:items-center">
				<div className="sm:flex-auto">
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
						{t("models.title")}
					</h1>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("models.subtitle")}
					</p>
				</div>
				<div className="mt-4 sm:mt-0 flex items-end gap-3">
					<RefreshControl
						loading={loading}
						lastUpdated={lastUpdated}
						onRefresh={refetch}
					/>
					{hasData && (
						<SearchBar
							value={query}
							onChange={handleSearch}
							placeholder={t("models.search_placeholder")}
						/>
					)}
				</div>
			</div>

			{!raw && loading ? (
				<SkeletonTable t={t} />
			) : groups.length === 0 ? (
				<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{t("models.no_data")}
				</p>
			) : (
				<>
					{/* Filters */}
					<div className="mt-4">
						<ModelFilters
							groups={typed}
							providerMap={providerMap}
							filters={filters}
							onChange={handleFiltersChange}
							prefix={
								typeCounts.embedding > 0 ? (
									<>
										<div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 dark:border-white/10 dark:bg-white/5">
											{(
												[
													["all", t("models.type_all"), typeCounts.all],
													["chat", t("models.type_chat"), typeCounts.chat],
													[
														"embedding",
														t("models.type_embedding"),
														typeCounts.embedding,
													],
												] as const
											).map(([key, label, count]) => (
												<button
													key={key}
													type="button"
													onClick={() => {
														setTypeTab(key);
														setPage(1);
													}}
													className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
														typeTab === key
															? "bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900"
															: "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
													}`}
												>
													{label}
													<span
														className={`tabular-nums text-[10px] ${
															typeTab === key
																? "text-gray-300 dark:text-gray-600"
																: "text-gray-400 dark:text-gray-500"
														}`}
													>
														{count}
													</span>
												</button>
											))}
										</div>
										<div className="h-5 w-px bg-gray-200 dark:bg-white/10" />
									</>
								) : undefined
							}
						/>
					</div>

					{/* Table */}
					<div className="mt-3 rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5 overflow-x-auto">
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
								{paged.length === 0 ? (
									<tr>
										<td
											colSpan={8}
											className="py-12 text-center text-sm text-gray-400 dark:text-gray-500"
										>
											{t("models.no_match", { query: query || "—" })}
										</td>
									</tr>
								) : (
									paged.map((g) => {
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
												<td className="py-2.5 pl-4 pr-2 sm:pl-5">
													<div className="min-w-0">
														<Link
															to={`/${g.id}`}
															className="text-sm font-semibold text-gray-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
														>
															<OrgLogo modelId={g.id} />
															{g.displayName}
														</Link>
														<div className="hidden items-center gap-1.5 mt-0.5 sm:flex">
															<code className="text-xs font-mono text-gray-500 dark:text-gray-400">
																{g.id}
															</code>
															<CopyButton text={g.id} />
															{g.createdAt > 0 && (
																<Badge variant="brand">
																	{formatRelativeTime(
																		g.createdAt,
																		i18n.language,
																	)}
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
													<div className="flex justify-end">
														<ProviderLogoGroup
															providers={g.providers}
															providerMap={providerMap}
														/>
													</div>
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>

					{/* Footer */}
					<div className="mt-3 flex items-center justify-between">
						<span className="text-xs text-gray-500 dark:text-gray-400">
							{query || filtersActive
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
		</div>
	);
}

function SkeletonTable({ t }: { t: (key: string) => string }) {
	return (
		<div className="mt-5 rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5 overflow-x-auto">
			<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
				<thead>
					<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
						<th className="py-2.5 pl-4 pr-2 sm:pl-5">{t("models.model")}</th>
						<th className="px-2 hidden lg:table-cell">Modalities</th>
						<th className="px-2 hidden md:table-cell">24h Chart</th>
						<th className="px-2 hidden md:table-cell">24h Range</th>
						<th className="px-2 text-right">Input /1M</th>
						<th className="px-2 text-right">Output /1M</th>
						<th className="px-2 text-right hidden sm:table-cell">
							{t("models.context")}
						</th>
						<th className="py-2.5 pl-2 pr-4 sm:pr-5 text-right">Providers</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
					{Array.from({ length: 8 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<tr key={i}>
							<td className="py-2.5 pl-4 pr-2 sm:pl-5">
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
								<div className="h-6 w-[clamp(80px,11vw,160px)] rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
							</td>
							<td className="px-2 py-2.5 hidden md:table-cell">
								<div className="h-4 w-[clamp(80px,11vw,160px)] rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
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
							<td className="py-2.5 pl-2 pr-4 sm:pr-5 text-right">
								<div className="h-5 w-7 rounded bg-gray-100 dark:bg-white/5 animate-pulse ml-auto" />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

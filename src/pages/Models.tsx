import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Modality } from "../../worker/core/db/schema";
import { CopyButton } from "../components/CopyButton";
import { ModalityBadges } from "../components/Modalities";
import { Modal } from "../components/Modal";
import { PageLoader } from "../components/PageLoader";
import { PriceChart } from "../components/PriceChart";
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
import { mergeModalities } from "../utils/modalities";

const PAGE_SIZE = 30;

interface ModelGroup {
	id: string;
	displayName: string;
	providers: ProviderRow[];
	createdAt: number;
	inputModalities: Modality[];
	outputModalities: Modality[];
}

interface ProviderRow {
	provider: string;
	inputPrice: number;
	outputPrice: number;
	platformInputPrice?: number;
	platformOutputPrice?: number;
	contextLength: number;
}

function aggregateModels(entries: ModelEntry[]): ModelGroup[] {
	const groups = new Map<string, ModelGroup>();

	for (const e of entries) {
		let group = groups.get(e.id);
		if (!group) {
			group = {
				id: e.id,
				displayName: e.name || e.id,
				providers: [],
				createdAt: 0,
				inputModalities: e.input_modalities ?? ["text"],
				outputModalities: e.output_modalities ?? ["text"],
			};
			groups.set(e.id, group);
		}
		if (e.name && group.displayName === group.id) {
			group.displayName = e.name;
		}
		mergeModalities(group.inputModalities, e.input_modalities);
		mergeModalities(group.outputModalities, e.output_modalities);
		if (e.created_at && (!group.createdAt || e.created_at < group.createdAt)) {
			group.createdAt = e.created_at;
		}
		group.providers.push({
			provider: e.provider,
			inputPrice: e.input_price ?? 0,
			outputPrice: e.output_price ?? 0,
			platformInputPrice: e.platform_input_price,
			platformOutputPrice: e.platform_output_price,
			contextLength: e.context_length ?? 0,
		});
	}

	for (const g of groups.values()) {
		g.providers.sort((a, b) => a.inputPrice - b.inputPrice);
	}

	return [...groups.values()];
}

function ModelDetailModal({
	group,
	providerMap,
	onClose,
}: {
	group: ModelGroup;
	providerMap: Map<string, ProviderMeta>;
	onClose: () => void;
}) {
	return (
		<Modal open onClose={onClose} title={group.displayName} size="3xl">
			<PriceChart
				dimension="model"
				value={group.id}
				className="border-0 shadow-none -mx-1"
			/>
			<table className="mt-4 min-w-full divide-y divide-gray-100 dark:divide-white/5">
				<thead>
					<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
						<th className="py-2 pr-2">Provider</th>
						<th className="px-2 text-right">Input /1M</th>
						<th className="px-2 text-right">Output /1M</th>
						<th className="py-2 pl-2 text-right">Context</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
					{group.providers.map((p, i) => (
						<tr
							key={p.provider}
							className={
								i === 0
									? "bg-brand-50/50 dark:bg-brand-500/[0.04]"
									: undefined
							}
						>
							<td className="py-2.5 pr-2 text-sm text-gray-700 dark:text-gray-300">
								{(() => {
									const meta = providerMap.get(p.provider);
									return (
										<span className="inline-flex items-center gap-1.5">
											{meta && (
												<ProviderLogo
													src={meta.logoUrl}
													name={meta.name}
													size={16}
												/>
											)}
											{meta?.name ?? p.provider}
											<CopyButton text={p.provider} />
										</span>
									);
								})()}
							</td>
							<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								<DualPrice
									original={p.inputPrice}
									platform={p.platformInputPrice}
								/>
							</td>
							<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								<DualPrice
									original={p.outputPrice}
									platform={p.platformOutputPrice}
								/>
							</td>
							<td className="py-2.5 pl-2 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								{formatContext(p.contextLength)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Modal>
	);
}

export function Models() {
	const { t } = useTranslation();
	const {
		data: raw,
		loading,
		error,
		refetch,
	} = useFetch<ModelEntry[]>("/api/models");
	const { data: providersData } = useFetch<ProviderMeta[]>("/api/providers");
	const { data: inputSparks } = useFetch<Record<string, SparklineData>>(
		"/api/sparklines/model:input",
	);
	const lastUpdated = useAutoRefresh(refetch, raw);

	const providerMap = useMemo(() => {
		const m = new Map<string, ProviderMeta>();
		for (const p of providersData ?? []) m.set(p.id, p);
		return m;
	}, [providersData]);

	const groups = useMemo(() => aggregateModels(raw ?? []), [raw]);

	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
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

	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	const paged = filtered.slice(
		(safePage - 1) * PAGE_SIZE,
		safePage * PAGE_SIZE,
	);

	const handleSearch = (v: string) => {
		setQuery(v);
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
			<div className="sm:flex sm:items-center">
				<div className="sm:flex-auto">
					<h3 className="text-base font-semibold text-gray-900 dark:text-white">
						{t("models.title")}
					</h3>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("models.subtitle")}
					</p>
				</div>
				<div className="mt-4 sm:mt-0 flex items-center gap-3">
					{lastUpdated && (
						<span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
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
				<div className="mt-5">
					<PageLoader />
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
								<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
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
													<div className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[260px]">
														{g.displayName}
													</div>
													<div className="flex items-center gap-1.5 mt-0.5">
														<code className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
															{g.id}
														</code>
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
												{spark && <Sparkline data={spark} />}
											</td>
											<td className="px-2 py-2.5 hidden md:table-cell">
												{spark && (
													<PriceRange
														data={spark}
														format={(v) => formatPrice(v * 100)}
													/>
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
													<Badge variant="brand">
														{g.providers.length}
													</Badge>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					{/* Pagination */}
					<div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
						<span>
							{query
								? t("models.result_count", {
										count: filtered.length,
										total: groups.length,
									})
								: `${filtered.length} ${t("models.title").toLowerCase()}`}
						</span>
						{totalPages > 1 && (
							<div className="flex items-center gap-1">
								<button
									type="button"
									disabled={safePage <= 1}
									onClick={() => setPage(safePage - 1)}
									className="px-2.5 py-1 rounded-md border border-gray-200 dark:border-white/10 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
								>
									{t("admin.prev")}
								</button>
								<span className="px-2 tabular-nums">
									{safePage} / {totalPages}
								</span>
								<button
									type="button"
									disabled={safePage >= totalPages}
									onClick={() => setPage(safePage + 1)}
									className="px-2.5 py-1 rounded-md border border-gray-200 dark:border-white/10 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
								>
									{t("admin.next")}
								</button>
							</div>
						)}
					</div>
				</>
			)}

			{selected && (
				<ModelDetailModal
					group={selected}
					providerMap={providerMap}
					onClose={() => setSelected(null)}
				/>
			)}
		</div>
	);
}

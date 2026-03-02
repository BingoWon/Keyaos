import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Modality } from "../../worker/core/db/schema";
import { CopyButton } from "../components/CopyButton";
import { ModalityCell } from "../components/Modalities";
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
import { formatContext, formatTimestamp } from "../utils/format";

interface ProviderModel {
	id: string;
	name: string;
	inputPrice: number;
	outputPrice: number;
	platformInputPrice?: number;
	platformOutputPrice?: number;
	contextLength: number;
	inputModalities: Modality[];
	outputModalities: Modality[];
}

interface ProviderGroup {
	provider: ProviderMeta;
	models: ProviderModel[];
	bestMultiplier?: number;
}

function ProviderDetailModal({
	group,
	onClose,
}: {
	group: ProviderGroup;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Modal
			open
			onClose={onClose}
			title={group.provider.name}
			size="4xl"
		>
			<PriceChart
				dimension="provider"
				value={group.provider.id}
				title={t("chart.multiplier_trend")}
				className="border-0 shadow-none -mx-1"
			/>
			<table className="mt-4 min-w-full divide-y divide-gray-100 dark:divide-white/5">
				<thead>
					<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
						<th className="py-2 pr-2">{t("models.model")}</th>
						<th className="px-2">In</th>
						<th className="px-2">Out</th>
						<th className="px-2 text-right">Input /1M</th>
						<th className="px-2 text-right">Output /1M</th>
						<th className="py-2 pl-2 text-right">Context</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
					{group.models.map((m) => (
						<tr key={m.id}>
							<td className="py-2.5 pr-2 text-sm text-gray-700 dark:text-gray-300">
								<span className="inline-flex items-center gap-1">
									<code className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate max-w-[240px]">
										{m.id}
									</code>
									<CopyButton text={m.id} />
								</span>
							</td>
							<td className="px-2 py-2.5">
								<ModalityCell modalities={m.inputModalities} />
							</td>
							<td className="px-2 py-2.5">
								<ModalityCell modalities={m.outputModalities} />
							</td>
							<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								<DualPrice
									original={m.inputPrice}
									platform={m.platformInputPrice}
								/>
							</td>
							<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								<DualPrice
									original={m.outputPrice}
									platform={m.platformOutputPrice}
								/>
							</td>
							<td className="py-2.5 pl-2 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								{m.contextLength > 0 ? formatContext(m.contextLength) : "—"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Modal>
	);
}

export function Providers() {
	const { t } = useTranslation();
	const {
		data: models,
		loading: modelsLoading,
		refetch: refetchModels,
	} = useFetch<ModelEntry[]>("/api/models");
	const { data: providersData, loading: providersLoading } =
		useFetch<ProviderMeta[]>("/api/providers");
	const {
		data: providerSparks,
		refetch: refetchSparks,
	} = useFetch<Record<string, SparklineData>>("/api/sparklines/provider");

	const refetch = useCallback(() => {
		refetchModels();
		refetchSparks();
	}, [refetchModels, refetchSparks]);

	const lastUpdated = useAutoRefresh(refetch, models);

	const groups = useMemo(() => {
		if (!models || !providersData) return [];

		const providerMap = new Map<string, ProviderMeta>();
		for (const p of providersData) providerMap.set(p.id, p);

		const byProvider = new Map<string, ProviderGroup>();
		for (const m of models) {
			const meta = providerMap.get(m.provider);
			if (!meta) continue;
			let group = byProvider.get(m.provider);
			if (!group) {
				group = { provider: meta, models: [] };
				byProvider.set(m.provider, group);
			}
			group.models.push({
				id: m.id,
				name: m.name ?? m.id,
				inputPrice: m.input_price ?? 0,
				outputPrice: m.output_price ?? 0,
				platformInputPrice: m.platform_input_price,
				platformOutputPrice: m.platform_output_price,
				contextLength: m.context_length ?? 0,
				inputModalities: m.input_modalities ?? ["text"],
				outputModalities: m.output_modalities ?? ["text"],
			});
		}

		for (const g of byProvider.values()) {
			const sample = g.models.find(
				(m) => m.platformInputPrice != null && m.inputPrice > 0,
			);
			if (sample?.platformInputPrice != null) {
				g.bestMultiplier = sample.platformInputPrice / sample.inputPrice;
			}
		}

		return [...byProvider.values()].sort(
			(a, b) => b.models.length - a.models.length,
		);
	}, [models, providersData]);

	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<ProviderGroup | null>(null);

	const filtered = useMemo(() => {
		if (!query.trim()) return groups;
		const q = query.toLowerCase();
		return groups.filter(
			(g) =>
				g.provider.id.toLowerCase().includes(q) ||
				g.provider.name.toLowerCase().includes(q),
		);
	}, [groups, query]);

	const initialLoading =
		(!models || !providersData) && (modelsLoading || providersLoading);

	return (
		<div>
			<div className="sm:flex sm:items-center">
				<div className="sm:flex-auto">
					<h3 className="text-base font-semibold text-gray-900 dark:text-white">
						{t("providers.title")}
					</h3>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("providers.subtitle")}
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
							className={`-ml-0.5 size-5 ${modelsLoading ? "animate-spin" : ""}`}
						/>
						{t("common_refresh")}
					</Button>
					{groups.length > 0 && (
						<SearchBar
							value={query}
							onChange={setQuery}
							placeholder={t("providers.search_placeholder")}
						/>
					)}
				</div>
			</div>

			{initialLoading ? (
				<div className="mt-5">
					<PageLoader />
				</div>
			) : groups.length === 0 ? (
				<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{t("providers.no_data")}
				</p>
			) : (
				<>
					<div className="mt-5 rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5 overflow-hidden">
						<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
							<thead>
								<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
									<th className="py-2.5 pl-4 pr-2 sm:pl-5">
										{t("models.provider")}
									</th>
									<th className="px-2 hidden md:table-cell max-w-[100px]">24h Chart</th>
									<th className="px-2 hidden md:table-cell max-w-[100px]">24h Range</th>
									<th className="px-2 text-right">Multiplier</th>
									<th className="py-2.5 pl-2 pr-4 sm:pr-5 text-right">
										{t("providers.models_count")}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
								{filtered.map((g) => {
									const spark = providerSparks?.[g.provider.id];
									return (
										<tr
											key={g.provider.id}
											onClick={() => setSelected(g)}
											className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
										>
											<td className="py-2.5 pl-4 pr-2 sm:pl-5">
												<span className="inline-flex items-center gap-2">
													<ProviderLogo
														src={g.provider.logoUrl}
														name={g.provider.name}
														size={22}
													/>
													<span>
														<div className="text-sm font-semibold text-gray-900 dark:text-white">
															{g.provider.name}
														</div>
														<div className="text-xs text-gray-500 dark:text-gray-400">
															{g.provider.id}
														</div>
													</span>
												</span>
											</td>
											<td className="px-2 py-2.5 hidden md:table-cell max-w-[100px]">
												{spark && <Sparkline data={spark} />}
											</td>
											<td className="px-2 py-2.5 hidden md:table-cell max-w-[100px]">
												{spark && (
													<PriceRange
														data={spark}
														format={(v) => `×${v.toFixed(2)}`}
													/>
												)}
											</td>
											<td className="px-2 py-2.5 text-right">
												{g.bestMultiplier != null &&
												g.bestMultiplier < 1 ? (
													<Badge variant="success">
														×{g.bestMultiplier.toFixed(3)}
													</Badge>
												) : (
													<span className="text-xs text-gray-400">—</span>
												)}
											</td>
											<td className="py-2.5 pl-2 pr-4 sm:pr-5 text-right">
												<Badge variant="brand">{g.models.length}</Badge>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					{query && (
						<p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
							{t("providers.result_count", {
								count: filtered.length,
								total: groups.length,
							})}
						</p>
					)}
					{query && filtered.length === 0 && (
						<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
							{t("providers.no_match", { query })}
						</p>
					)}
				</>
			)}

			{selected && (
				<ProviderDetailModal
					group={selected}
					onClose={() => setSelected(null)}
				/>
			)}
		</div>
	);
}

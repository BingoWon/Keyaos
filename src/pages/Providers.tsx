import { ArrowPathIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Modality } from "../../worker/core/db/schema";
import { CopyButton } from "../components/CopyButton";
import { ModalityCell } from "../components/Modalities";
import { PageLoader } from "../components/PageLoader";
import { PriceChart } from "../components/PriceChart";
import { ProviderLogo } from "../components/ProviderLogo";
import { SearchBar } from "../components/SearchBar";
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

function ProviderCard({ group }: { group: ProviderGroup }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	return (
		<div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden transition-shadow hover:shadow-sm">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="w-full px-4 py-3.5 sm:px-5 flex items-center gap-3 hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer select-none text-left"
			>
				<ChevronRightIcon
					className={`size-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
				/>
				<ProviderLogo
					src={group.provider.logoUrl}
					name={group.provider.name}
					size={24}
				/>
				<div className="min-w-0 flex-1">
					<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
						{group.provider.name}
					</h4>
					<span className="text-xs text-gray-500 dark:text-gray-400">
						{group.provider.id}
					</span>
				</div>
				<div className="shrink-0 flex items-center gap-1.5">
					{group.bestMultiplier != null && group.bestMultiplier < 1 && (
						<Badge variant="success">×{group.bestMultiplier.toFixed(3)}</Badge>
					)}
					<Badge variant="brand">
						{group.models.length} {t("providers.models_count")}
					</Badge>
				</div>
			</button>

			{open && (
				<div className="border-t border-gray-100 dark:border-white/5">
					<PriceChart
						dimension="provider"
						value={group.provider.id}
						title={t("chart.multiplier_trend")}
						className="m-3 border-0 shadow-none"
					/>
					<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
						<thead>
							<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
								<th className="py-2.5 pl-4 pr-2 sm:pl-5">
									{t("models.model")}
								</th>
								<th className="px-2">In</th>
								<th className="px-2">Out</th>
								<th className="px-2 text-right">Input /1M</th>
								<th className="px-2 text-right">Output /1M</th>
								<th className="py-2.5 pl-2 pr-4 sm:pr-5 text-right">Context</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
							{group.models.map((m) => (
								<tr key={m.id}>
									<td className="py-2.5 pl-4 pr-2 sm:pl-5 text-sm text-gray-700 dark:text-gray-300">
										<span className="inline-flex items-center gap-1">
											<code className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
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
									<td className="py-2.5 pl-2 pr-4 sm:pr-5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
										{m.contextLength > 0 ? formatContext(m.contextLength) : "—"}
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

export function Providers() {
	const { t } = useTranslation();
	const {
		data: models,
		loading: modelsLoading,
		refetch: refetchModels,
	} = useFetch<ModelEntry[]>("/api/models");
	const { data: providersData, loading: providersLoading } =
		useFetch<ProviderMeta[]>("/api/providers");
	const lastUpdated = useAutoRefresh(refetchModels, models);

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
					<Button onClick={refetchModels} className="shrink-0">
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
					{query && (
						<p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
							{t("providers.result_count", { count: filtered.length, total: groups.length })}
						</p>
					)}
					<div className={`${query ? "mt-2" : "mt-5"} grid gap-3`}>
						{filtered.map((g) => (
							<ProviderCard key={g.provider.id} group={g} />
						))}
					</div>
					{query && filtered.length === 0 && (
						<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
							{t("providers.no_match", { query })}
						</p>
					)}
				</>
			)}
		</div>
	);
}

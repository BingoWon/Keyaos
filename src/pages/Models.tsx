import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "../components/CopyButton";
import { ModalityBadges } from "../components/Modalities";
import { PageLoader } from "../components/PageLoader";
import { PriceChart } from "../components/PriceChart";
import { ProviderLogo } from "../components/ProviderLogo";
import { Badge, DualPrice } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import type { ModelEntry } from "../types/model";
import type { ProviderMeta } from "../types/provider";
import { formatContext } from "../utils/format";
import { mergeModalities } from "../utils/modalities";

interface ModelGroup {
	id: string;
	displayName: string;
	providers: ProviderRow[];
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
				inputModalities: e.input_modalities ?? ["text"],
				outputModalities: e.output_modalities ?? ["text"],
			};
			groups.set(e.id, group);
		}
		if (e.name && group.displayName === group.id) {
			group.displayName = e.name;
		}
		// Merge modalities (take union across providers)
		mergeModalities(group.inputModalities, e.input_modalities);
		mergeModalities(group.outputModalities, e.output_modalities);
		group.providers.push({
			provider: e.owned_by,
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

	return [...groups.values()].sort(
		(a, b) =>
			b.providers.length - a.providers.length ||
			b.id.localeCompare(a.id, undefined, { numeric: true }),
	);
}

function ModelCard({
	group,
	providerMap,
}: {
	group: ModelGroup;
	providerMap: Map<string, ProviderMeta>;
}) {
	const [open, setOpen] = useState(false);
	const best = group.providers[0];
	const maxContext = Math.max(...group.providers.map((p) => p.contextLength));

	return (
		<div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden transition-shadow hover:shadow-sm">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="w-full px-4 py-3.5 sm:px-5 flex items-start gap-3 hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer select-none text-left"
			>
				<ChevronRightIcon
					className={`mt-0.5 size-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
				/>
				<div className="min-w-0 flex-1">
					<h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
						{group.displayName}
					</h4>
					<span className="flex items-center gap-1 mt-1">
						<code className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
							{group.id}
						</code>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: isolates click from parent button */}
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: inner button handles keyboard */}
						<span onClick={(e) => e.stopPropagation()}>
							<CopyButton text={group.id} />
						</span>
					</span>
				</div>
				<div className="shrink-0 flex flex-col items-end gap-2">
					<div className="flex items-center gap-1.5">
						<div className="hidden sm:flex items-center gap-1">
							{group.providers.slice(0, 5).map((p) => {
								const meta = providerMap.get(p.provider);
								return meta ? (
									<ProviderLogo
										key={p.provider}
										src={meta.logoUrl}
										name={meta.name}
										size={18}
									/>
								) : null;
							})}
						</div>
						<Badge variant="brand">{group.providers.length}</Badge>
					</div>
					<div className="flex flex-wrap items-center justify-end gap-1.5">
						<ModalityBadges input={group.inputModalities} output={group.outputModalities} />
						<Badge variant="success">
							<DualPrice
								original={best.inputPrice}
								platform={best.platformInputPrice}
							/>
							in
						</Badge>
						<Badge variant="accent">
							<DualPrice
								original={best.outputPrice}
								platform={best.platformOutputPrice}
							/>
							out
						</Badge>
						{maxContext > 0 && <Badge>{formatContext(maxContext)} ctx</Badge>}
					</div>
				</div>
			</button>

			{open && (
				<div className="border-t border-gray-100 dark:border-white/5">
					<PriceChart
						dimension="model"
						value={group.id}
						className="m-3 border-0 shadow-none"
					/>
					<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
						<thead>
							<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
								<th className="py-2.5 pl-4 pr-2 sm:pl-5">Provider</th>
								<th className="px-2 text-right">Input /1M</th>
								<th className="px-2 text-right">Output /1M</th>
								<th className="py-2.5 pl-2 pr-4 sm:pr-5 text-right">Context</th>
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
									<td className="py-2.5 pl-4 pr-2 sm:pl-5 text-sm text-gray-700 dark:text-gray-300">
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
									<td className="py-2.5 pl-2 pr-4 sm:pr-5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
										{formatContext(p.contextLength)}
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

export function Models() {
	const { t } = useTranslation();
	const { data: raw, loading, error } = useFetch<ModelEntry[]>("/v1/models");
	const { data: providersData } = useFetch<ProviderMeta[]>("/api/providers");

	const providerMap = useMemo(() => {
		const m = new Map<string, ProviderMeta>();
		for (const p of providersData ?? []) m.set(p.id, p);
		return m;
	}, [providersData]);

	const groups = useMemo(() => aggregateModels(raw ?? []), [raw]);

	if (error) {
		return (
			<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-900/20 dark:text-red-400">
				Failed to load models: {error.message}
			</div>
		);
	}

	return (
		<div>
			<div>
				<h3 className="text-base font-semibold text-gray-900 dark:text-white">
					{t("models.title")}
				</h3>
				<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
					{t("models.subtitle")}
				</p>
			</div>

			{loading ? (
				<div className="mt-5">
					<PageLoader />
				</div>
			) : groups.length === 0 ? (
				<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{t("models.no_data")}
				</p>
			) : (
				<div className="mt-5 grid gap-3">
					{groups.map((g) => (
						<ModelCard key={g.id} group={g} providerMap={providerMap} />
					))}
				</div>
			)}
		</div>
	);
}

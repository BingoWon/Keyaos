import {
	ArrowPathIcon,
	ChevronRightIcon,
	MagnifyingGlassIcon,
	XMarkIcon,
} from "@heroicons/react/20/solid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "../components/CopyButton";
import { ModalityBadges } from "../components/Modalities";
import { PageLoader } from "../components/PageLoader";
import { PriceChart } from "../components/PriceChart";
import { ProviderLogo } from "../components/ProviderLogo";
import { Badge, Button, DualPrice } from "../components/ui";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { useFetch } from "../hooks/useFetch";
import type { ModelEntry } from "../types/model";
import type { ProviderMeta } from "../types/provider";
import {
	formatContext,
	formatRelativeTime,
	formatTimestamp,
} from "../utils/format";
import { mergeModalities } from "../utils/modalities";

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
		// Merge modalities (take union across providers)
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
					<span className="flex items-center gap-1.5 mt-1">
						<code className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
							{group.id}
						</code>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: isolates click from parent button */}
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: inner button handles keyboard */}
						<span onClick={(e) => e.stopPropagation()}>
							<CopyButton text={group.id} />
						</span>
						{group.createdAt > 0 && (
							<span className="ml-1 text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
								{formatRelativeTime(group.createdAt)}
							</span>
						)}
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
						<ModalityBadges
							input={group.inputModalities}
							output={group.outputModalities}
						/>
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
	const {
		data: raw,
		loading,
		error,
		refetch,
	} = useFetch<ModelEntry[]>("/api/models");
	const { data: providersData } = useFetch<ProviderMeta[]>("/api/providers");
	const lastUpdated = useAutoRefresh(refetch, raw);

	const providerMap = useMemo(() => {
		const m = new Map<string, ProviderMeta>();
		for (const p of providersData ?? []) m.set(p.id, p);
		return m;
	}, [providersData]);

	const groups = useMemo(() => aggregateModels(raw ?? []), [raw]);

	// ─── Search ────────────────────────────────────────
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const filtered = useMemo(() => {
		if (!query.trim()) return groups;
		const q = query.toLowerCase();
		return groups.filter(
			(g) =>
				g.id.toLowerCase().includes(q) ||
				g.displayName.toLowerCase().includes(q),
		);
	}, [groups, query]);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "k") {
			e.preventDefault();
			inputRef.current?.focus();
		}
		if (e.key === "Escape" && document.activeElement === inputRef.current) {
			setQuery("");
			inputRef.current?.blur();
		}
	}, []);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

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
					<Button
						variant="secondary"
						size="sm"
						onClick={refetch}
						className="tabular-nums shrink-0"
					>
						<ArrowPathIcon
							className={`size-3.5 ${loading ? "animate-spin" : ""}`}
						/>
						{lastUpdated && formatTimestamp(lastUpdated)}
					</Button>
					{raw && groups.length > 0 && (
						<div className="relative flex-1 sm:flex-none sm:w-72">
							<MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 dark:text-gray-500" />
							<input
								ref={inputRef}
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search models…"
								className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] py-2 pl-9 pr-20 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
							/>
							<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
								{query ? (
									<button
										type="button"
										onClick={() => {
											setQuery("");
											inputRef.current?.focus();
										}}
										className="rounded-md p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
									>
										<XMarkIcon className="size-4" />
									</button>
								) : (
									<kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">
										⌘K
									</kbd>
								)}
							</div>
						</div>
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
					{query && (
						<p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
							{filtered.length} of {groups.length} models
						</p>
					)}
					<div className={`${query ? "mt-2" : "mt-5"} grid gap-3`}>
						{filtered.map((g) => (
							<ModelCard key={g.id} group={g} providerMap={providerMap} />
						))}
					</div>
					{query && filtered.length === 0 && (
						<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
							No models matching "{query}"
						</p>
					)}
				</>
			)}
		</div>
	);
}

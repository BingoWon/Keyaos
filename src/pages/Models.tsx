import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { CopyButton } from "../components/CopyButton";
import { PageLoader } from "../components/PageLoader";
import { ProviderLogo } from "../components/ProviderLogo";
import { Badge, Button } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import type { ProviderMeta } from "../types/provider";

interface ModelEntry {
	id: string;
	owned_by: string;
	name?: string;
	input_price?: number;
	output_price?: number;
	context_length?: number;
}

interface ModelGroup {
	id: string;
	displayName: string;
	providers: ProviderRow[];
}

interface ProviderRow {
	provider: string;
	inputPrice: number;
	outputPrice: number;
	contextLength: number;
}

function formatPrice(price: number) {
	if (price === 0) return "Free";
	const usd = price / 100;
	if (usd >= 0.01) return `$${usd.toFixed(2)}`;
	return `$${Number(usd.toPrecision(3))}`;
}

function formatContext(len: number) {
	if (len >= 1_000_000)
		return `${(len / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (len >= 1000) return `${(len / 1000).toFixed(0)}K`;
	return len.toString();
}

function aggregateModels(entries: ModelEntry[]): ModelGroup[] {
	const groups = new Map<string, ModelGroup>();

	for (const e of entries) {
		let group = groups.get(e.id);
		if (!group) {
			group = { id: e.id, displayName: e.name || e.id, providers: [] };
			groups.set(e.id, group);
		}
		if (e.name && group.displayName === group.id) {
			group.displayName = e.name;
		}
		group.providers.push({
			provider: e.owned_by,
			inputPrice: e.input_price ?? 0,
			outputPrice: e.output_price ?? 0,
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
			<div
				role="button"
				tabIndex={0}
				onClick={() => setOpen(!open)}
				onKeyDown={(e) => e.key === "Enter" && setOpen(!open)}
				className="w-full px-4 py-3.5 sm:px-5 flex items-start gap-3 hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer select-none"
			>
				<ChevronRightIcon
					className={`mt-0.5 size-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
				/>
				<div className="min-w-0 flex-1">
					<h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
						{group.displayName}
					</h4>
					<span className="flex items-center gap-1 mt-0.5">
						<code className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
							{group.id}
						</code>
						<span
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => e.stopPropagation()}
						>
							<CopyButton text={group.id} />
						</span>
					</span>
				</div>
				<div className="shrink-0 flex flex-col items-end gap-2 pt-0.5">
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
						<Badge variant="success">
							{formatPrice(best.inputPrice)} in
						</Badge>
						<Badge variant="accent">
							{formatPrice(best.outputPrice)} out
						</Badge>
						{maxContext > 0 && <Badge>{formatContext(maxContext)} ctx</Badge>}
					</div>
				</div>
			</div>

			{open && (
				<div className="border-t border-gray-100 dark:border-white/5">
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
										{formatPrice(p.inputPrice)}
									</td>
									<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
										{formatPrice(p.outputPrice)}
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
	const { getToken } = useAuth();
	const {
		data: raw,
		loading,
		error,
		refetch,
	} = useFetch<ModelEntry[]>("/v1/models");
	const { data: providersData } = useFetch<ProviderMeta[]>("/api/providers");
	const [syncing, setSyncing] = useState(false);

	const providerMap = useMemo(() => {
		const m = new Map<string, ProviderMeta>();
		for (const p of providersData ?? []) m.set(p.id, p);
		return m;
	}, [providersData]);

	const groups = useMemo(() => aggregateModels(raw ?? []), [raw]);

	const handleSync = useCallback(
		async (silent = false) => {
			setSyncing(true);
			let tid: string | undefined;
			if (!silent) {
				tid = toast.loading(t("models.syncing", "Syncing..."));
			}
			try {
				const token = await getToken();
				const res = await fetch("/api/models/sync", {
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
				});
				if (res.ok) {
					if (!silent) {
						toast.success(t("models.sync_success", "Sync completed"), {
							id: tid,
						});
					}
					refetch();
				} else {
					throw new Error(res.statusText);
				}
			} catch (_err) {
				if (!silent) {
					toast.error(t("models.sync_failed", "Sync failed"), {
						id: tid,
					});
				}
			} finally {
				setSyncing(false);
			}
		},
		[t, getToken, refetch],
	);

	const hasSynced = useRef(false);
	useEffect(() => {
		if (
			!loading &&
			!error &&
			(!raw || raw.length === 0) &&
			!hasSynced.current &&
			!syncing
		) {
			hasSynced.current = true;
			handleSync(true);
		}
	}, [raw, loading, error, syncing, handleSync]);

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
				<div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
					<Button onClick={() => handleSync()} disabled={syncing}>
						{syncing
							? t("models.syncing", "Syncing...")
							: t("models.sync_now", "Sync Now")}
					</Button>
				</div>
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

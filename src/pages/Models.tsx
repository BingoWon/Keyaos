import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { CopyButton } from "../components/CopyButton";
import { PageLoader } from "../components/PageLoader";
import { ProviderLogo } from "../components/ProviderLogo";
import { useFetch } from "../hooks/useFetch";

interface ModelEntry {
	id: string;
	owned_by: string;
	name?: string;
	input_price?: number;
	output_price?: number;
	context_length?: number;
}

interface ProviderMeta {
	id: string;
	name: string;
	logoUrl: string;
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
	return `$${(price / 100).toFixed(4).replace(/\.?0+$/, "")}`;
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
			b.providers.length - a.providers.length || a.id.localeCompare(b.id),
	);
}

function ModelCard({
	group,
	providerMap,
}: {
	group: ModelGroup;
	providerMap: Map<string, ProviderMeta>;
}) {
	return (
		<div className="rounded-lg ring-1 ring-gray-200 dark:ring-white/10 overflow-hidden">
			<div className="px-4 py-3 sm:px-5 flex items-start justify-between gap-3 bg-gray-50 dark:bg-white/[0.03]">
				<div className="min-w-0">
					<h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
						{group.displayName}
					</h4>
					<div className="mt-0.5 flex items-center gap-1.5">
						<code className="text-xs font-mono text-gray-500 dark:text-gray-400">
							{group.id}
						</code>
						<CopyButton text={group.id} />
					</div>
				</div>
				<span className="shrink-0 inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400">
					{group.providers.length}
				</span>
			</div>

			<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
				<thead>
					<tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-500">
						<th className="py-2 pl-4 pr-2 sm:pl-5">Provider</th>
						<th className="px-2 text-right">Input /1M</th>
						<th className="px-2 text-right">Output /1M</th>
						<th className="py-2 pl-2 pr-4 sm:pr-5 text-right">Context</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
					{group.providers.map((p, i) => (
						<tr
							key={p.provider}
							className={
								i === 0 ? "bg-green-50/40 dark:bg-green-500/[0.04]" : undefined
							}
						>
							<td className="py-2 pl-4 pr-2 sm:pl-5 text-sm text-gray-700 dark:text-gray-300">
								<span className="inline-flex items-center gap-1.5">
									{(() => {
										const meta = providerMap.get(p.provider);
										return meta ? (
											<ProviderLogo
												src={meta.logoUrl}
												name={meta.name}
												size={16}
											/>
										) : null;
									})()}
									{providerMap.get(p.provider)?.name ?? p.provider}
								</span>
							</td>
							<td className="px-2 py-2 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								{formatPrice(p.inputPrice)}
							</td>
							<td className="px-2 py-2 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								{formatPrice(p.outputPrice)}
							</td>
							<td className="py-2 pl-2 pr-4 sm:pr-5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								{formatContext(p.contextLength)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
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
			<div className="p-4 text-sm text-red-500 bg-red-50 rounded-lg dark:bg-red-900/20 dark:text-red-400">
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
					<button
						type="button"
						onClick={handleSync}
						disabled={syncing}
						className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
					>
						{syncing
							? t("models.syncing", "Syncing...")
							: t("models.sync_now", "Sync Now")}
					</button>
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

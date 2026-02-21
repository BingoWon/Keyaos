import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";

interface ModelInfo {
	id: string;
	object: string;
	created: number;
	owned_by: string;
	name?: string;
	input_price?: number;
	output_price?: number;
	context_length?: number;
}

function formatPrice(price?: number) {
	if (price == null) return "-";
	if (price === 0) return "Free";
	return `${price.toFixed(4).replace(/\.?0+$/, "")}/1M`;
}

function formatContext(len?: number) {
	if (!len) return "-";
	return len >= 1000 ? `${(len / 1000).toFixed(0)}K` : len.toString();
}

export function Market() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const {
		data: quotes,
		loading,
		error,
		refetch,
	} = useFetch<ModelInfo[]>("/v1/models");
	const [refreshing, setRefreshing] = useState(false);

	const handleRefresh = useCallback(
		async (silent = false) => {
			setRefreshing(true);
			let tid: string | undefined;
			if (!silent) {
				tid = toast.loading(t("market.syncing", "Syncing pricing..."));
			}
			try {
				const token = await getToken();
				const res = await fetch("/api/refresh", {
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
				});
				if (res.ok) {
					if (!silent) {
						toast.success(t("market.sync_success", "Pricing synced"), {
							id: tid,
						});
					}
					refetch();
				} else {
					throw new Error(res.statusText);
				}
			} catch (_err) {
				if (!silent) {
					toast.error(t("market.sync_failed", "Sync failed"), {
						id: tid,
					});
				}
			} finally {
				setRefreshing(false);
			}
		},
		[t, getToken, refetch],
	);

	// Auto-sync on first load if pricing data is empty
	const hasAutoRefreshed = useRef(false);
	useEffect(() => {
		if (
			!loading &&
			!error &&
			(!quotes || quotes.length === 0) &&
			!hasAutoRefreshed.current &&
			!refreshing
		) {
			hasAutoRefreshed.current = true;
			handleRefresh(true); // silent refresh
		}
	}, [quotes, loading, error, refreshing, handleRefresh]);

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
						{t("market.title")}
					</h3>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("market.subtitle")}
					</p>
				</div>
				<div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
					<button
						type="button"
						onClick={handleRefresh}
						disabled={refreshing}
						className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
					>
						{refreshing
							? t("market.syncing", "Syncing...")
							: t("market.sync_now", "Sync Pricing")}
					</button>
				</div>
			</div>

			{loading ? (
				<div className="mt-5">
					<PageLoader />
				</div>
			) : !quotes?.length ? (
				<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{t("market.no_data")}
				</p>
			) : (
				<div className="mt-5 overflow-hidden shadow ring-1 ring-black/5 rounded-lg dark:ring-white/10">
					<table className="min-w-full divide-y divide-gray-300 dark:divide-white/10">
						<thead className="bg-gray-50 dark:bg-white/5">
							<tr>
								<th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">
									{t("market.model")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("market.provider")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("market.name")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
									{t("market.input_price")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
									{t("market.output_price")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
									{t("market.context")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-200 dark:divide-white/5 bg-white dark:bg-transparent">
							{quotes.map((m) => (
								<tr key={m.id}>
									<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-white sm:pl-6">
										{m.id}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
										{m.owned_by}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
										{m.name || "-"}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-right font-mono">
										{formatPrice(m.input_price)}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-right font-mono">
										{formatPrice(m.output_price)}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-right font-mono">
										{formatContext(m.context_length)}
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

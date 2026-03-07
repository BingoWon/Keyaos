import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";

const TABLES = [
	"logs",
	"upstream_credentials",
	"wallets",
	"payments",
	"api_keys",
	"model_pricing",
	"price_candles",
	"credit_adjustments",
	"auto_topup_config",
	"chat_threads",
	"chat_messages",
	"werewolf_sessions",
	"werewolf_characters",
];

function formatCell(value: unknown): string {
	if (value == null) return "—";
	if (typeof value === "number" && !Number.isInteger(value)) {
		const abs = Math.abs(value);
		if (abs >= 0.01) return value.toFixed(2);
		return String(Number(value.toPrecision(3)));
	}
	return String(value);
}

export function Data() {
	const { t } = useTranslation();
	const [table, setTable] = useState(TABLES[0]);
	const [page, setPage] = useState(0);
	const limit = 50;

	const { data, loading, refetch } = useFetch<{
		rows: Record<string, unknown>[];
		total: number;
	}>(`/api/admin/table/${table}?limit=${limit}&offset=${page * limit}`);

	const rows = data?.rows ?? [];
	const total = data?.total ?? 0;
	const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
	const totalPages = Math.ceil(total / limit);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-3 flex-wrap">
				<h3 className="text-base font-semibold text-gray-900 dark:text-white">
					{t("admin.data_explorer")}
				</h3>
				<div className="flex items-center gap-2">
					<select
						value={table}
						onChange={(e) => {
							setTable(e.target.value);
							setPage(0);
						}}
						className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
					>
						{TABLES.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</select>
					<IconButton label="Refresh" onClick={refetch}>
						<ArrowPathIcon />
					</IconButton>
				</div>
			</div>

			{loading ? (
				<div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
					<div className="divide-y divide-gray-200 dark:divide-white/10">
						{Array.from({ length: 8 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							<div key={i} className="flex items-center gap-4 px-3 py-2.5">
								{Array.from({ length: 5 }).map((_, j) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
										key={j}
										className="h-4 w-24 rounded bg-gray-200 dark:bg-white/10 animate-pulse"
									/>
								))}
							</div>
						))}
					</div>
				</div>
			) : rows.length === 0 ? (
				<p className="text-sm text-gray-500 dark:text-gray-400">
					{t("admin.no_data")}
				</p>
			) : (
				<>
					<div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
						<table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
							<thead className="bg-gray-50 dark:bg-white/5">
								<tr>
									{columns.map((col) => (
										<th
											key={col}
											className="px-3 py-2 text-left text-xs font-semibold text-gray-900 dark:text-white"
										>
											{col}
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-200 dark:divide-white/5 bg-white dark:bg-transparent">
								{rows.map((row) => {
									const rowKey = String(
										row.id ?? row[columns[0]] ?? crypto.randomUUID(),
									);
									return (
										<tr key={rowKey}>
											{columns.map((col) => (
												<td
													key={col}
													className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-[200px] truncate"
													title={String(row[col] ?? "")}
												>
													{formatCell(row[col])}
												</td>
											))}
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					{totalPages > 1 && (
						<div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
							<span>
								{t("admin.showing", {
									from: page * limit + 1,
									to: Math.min((page + 1) * limit, total),
									total,
								})}
							</span>
							<div className="flex gap-2">
								<button
									type="button"
									disabled={page === 0}
									onClick={() => setPage((p) => p - 1)}
									className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs transition-colors hover:bg-gray-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/5"
								>
									{t("admin.prev")}
								</button>
								<button
									type="button"
									disabled={page >= totalPages - 1}
									onClick={() => setPage((p) => p + 1)}
									className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs transition-colors hover:bg-gray-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/5"
								>
									{t("admin.next")}
								</button>
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
}

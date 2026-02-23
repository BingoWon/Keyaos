import {
	ArrowPathIcon,
	BanknotesIcon,
	ChartBarIcon,
	CreditCardIcon,
	ServerStackIcon,
	TableCellsIcon,
	UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";

// ─── Types ───────────────────────────────────────────────

interface Overview {
	totalRevenue: number;
	totalConsumption: number;
	totalServiceFees: number;
	totalRequests: number;
	activeCredentials: number;
	registeredUsers: number;
}

interface UserRow {
	ownerId: string;
	balance: number;
	totalToppedUp: number;
	totalConsumed: number;
	credentialsShared: number;
}

// ─── Platform Overview ───────────────────────────────────

function PlatformOverview() {
	const { t } = useTranslation();
	const { data, loading, refetch } = useFetch<Overview>("/api/admin/overview");

	const cards = data
		? [
				{
					name: t("admin.total_revenue"),
					value: `$${data.totalRevenue.toFixed(2)}`,
					icon: BanknotesIcon,
				},
				{
					name: t("admin.total_consumption"),
					value: `$${data.totalConsumption.toFixed(4)}`,
					icon: CreditCardIcon,
				},
				{
					name: t("admin.service_fees"),
					value: `$${data.totalServiceFees.toFixed(4)}`,
					icon: ChartBarIcon,
				},
				{
					name: t("admin.total_requests"),
					value: data.totalRequests.toLocaleString(),
					icon: TableCellsIcon,
				},
				{
					name: t("admin.active_credentials"),
					value: data.activeCredentials.toString(),
					icon: ServerStackIcon,
				},
				{
					name: t("admin.registered_users"),
					value: data.registeredUsers.toString(),
					icon: UserGroupIcon,
				},
			]
		: [];

	return (
		<section>
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
					{t("admin.overview")}
				</h4>
				<button
					type="button"
					onClick={refetch}
					className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
				>
					<ArrowPathIcon className="size-4" />
				</button>
			</div>
			{loading ? (
				<PageLoader />
			) : (
				<dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
					{cards.map((c) => (
						<div
							key={c.name}
							className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow dark:bg-white/5"
						>
							<dt className="flex items-center gap-2 truncate text-sm font-medium text-gray-500 dark:text-gray-400">
								<c.icon className="size-4 shrink-0" />
								{c.name}
							</dt>
							<dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
								{c.value}
							</dd>
						</div>
					))}
				</dl>
			)}
		</section>
	);
}

// ─── User Management ─────────────────────────────────────

function UserManagement() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const {
		data: users,
		loading,
		refetch,
	} = useFetch<UserRow[]>("/api/admin/users");
	const [adjusting, setAdjusting] = useState<string | null>(null);
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");

	const handleAdjust = useCallback(
		async (ownerId: string) => {
			const num = Number.parseFloat(amount);
			if (!num || num === 0) {
				toast.error(t("admin.amount_required"));
				return;
			}
			try {
				const token = await getToken();
				const res = await fetch("/api/admin/credits", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ ownerId, amount: num, reason }),
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				toast.success(
					num > 0 ? t("admin.grant_success") : t("admin.revoke_success"),
				);
				setAdjusting(null);
				setAmount("");
				setReason("");
				refetch();
			} catch {
				toast.error(t("common.error"));
			}
		},
		[amount, reason, getToken, refetch, t],
	);

	return (
		<section>
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
					{t("admin.users")}
				</h4>
				<button
					type="button"
					onClick={refetch}
					className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
				>
					<ArrowPathIcon className="size-4" />
				</button>
			</div>
			{loading ? (
				<PageLoader />
			) : !users?.length ? (
				<p className="mt-4 text-sm text-gray-500">{t("admin.no_users")}</p>
			) : (
				<div className="mt-3 overflow-x-auto shadow ring-1 ring-black/5 rounded-lg dark:ring-white/10">
					<table className="min-w-full divide-y divide-gray-300 dark:divide-white/10">
						<thead className="bg-gray-50 dark:bg-white/5">
							<tr>
								<th className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-gray-900 dark:text-white sm:pl-6">
									{t("admin.user_id")}
								</th>
								<th className="px-3 py-3 text-right text-xs font-semibold text-gray-900 dark:text-white">
									{t("admin.balance")}
								</th>
								<th className="px-3 py-3 text-right text-xs font-semibold text-gray-900 dark:text-white">
									{t("admin.topped_up")}
								</th>
								<th className="px-3 py-3 text-right text-xs font-semibold text-gray-900 dark:text-white">
									{t("admin.consumed")}
								</th>
								<th className="px-3 py-3 text-right text-xs font-semibold text-gray-900 dark:text-white">
									{t("admin.credentials_count")}
								</th>
								<th className="px-3 py-3 text-right text-xs font-semibold text-gray-900 dark:text-white sm:pr-6">
									{t("common.actions")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-200 dark:divide-white/5 bg-white dark:bg-transparent">
							{users.map((u) => (
								<tr key={u.ownerId}>
									<td className="whitespace-nowrap py-3 pl-4 pr-3 text-xs font-mono text-gray-500 dark:text-gray-400 sm:pl-6">
										{u.ownerId}
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
										${u.balance.toFixed(4)}
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-sm text-right text-gray-500 dark:text-gray-400">
										${u.totalToppedUp.toFixed(2)}
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-sm text-right text-gray-500 dark:text-gray-400">
										${u.totalConsumed.toFixed(4)}
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-sm text-right text-gray-500 dark:text-gray-400">
										{u.credentialsShared}
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-right sm:pr-6">
										{adjusting === u.ownerId ? (
											<div className="flex items-center justify-end gap-2">
												<input
													type="number"
													step="any"
													placeholder={t("admin.amount_placeholder")}
													value={amount}
													onChange={(e) => setAmount(e.target.value)}
													className="w-24 rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
												/>
												<input
													type="text"
													placeholder={t("admin.reason_placeholder")}
													value={reason}
													onChange={(e) => setReason(e.target.value)}
													className="w-32 rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
												/>
												<button
													type="button"
													onClick={() => handleAdjust(u.ownerId)}
													className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500"
												>
													{t("common.confirm")}
												</button>
												<button
													type="button"
													onClick={() => {
														setAdjusting(null);
														setAmount("");
														setReason("");
													}}
													className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
												>
													{t("common.cancel")}
												</button>
											</div>
										) : (
											<button
												type="button"
												onClick={() => setAdjusting(u.ownerId)}
												className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20"
											>
												{t("admin.adjust")}
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}

// ─── Data Explorer ───────────────────────────────────────

const TABLES = [
	"ledger",
	"upstream_credentials",
	"wallets",
	"payments",
	"api_keys",
	"model_pricing",
	"credit_adjustments",
];

function DataExplorer() {
	const { t } = useTranslation();
	const [table, setTable] = useState(TABLES[0]);
	const [page, setPage] = useState(0);
	const limit = 50;

	const { data, loading, refetch } = useFetch<{
		data: Record<string, unknown>[];
		total: number;
	}>(`/api/admin/table/${table}?limit=${limit}&offset=${page * limit}`);

	const rows = data?.data ?? [];
	const total = data?.total ?? 0;
	const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
	const totalPages = Math.ceil(total / limit);

	return (
		<section>
			<div className="flex items-center justify-between gap-3 flex-wrap">
				<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
					{t("admin.data_explorer")}
				</h4>
				<div className="flex items-center gap-2">
					<select
						value={table}
						onChange={(e) => {
							setTable(e.target.value);
							setPage(0);
						}}
						className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
					>
						{TABLES.map((t) => (
							<option key={t} value={t}>
								{t}
							</option>
						))}
					</select>
					<button
						type="button"
						onClick={refetch}
						className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
					>
						<ArrowPathIcon className="size-4" />
					</button>
				</div>
			</div>

			{loading ? (
				<PageLoader />
			) : rows.length === 0 ? (
				<p className="mt-4 text-sm text-gray-500">{t("admin.no_data")}</p>
			) : (
				<>
					<div className="mt-3 overflow-x-auto shadow ring-1 ring-black/5 rounded-lg dark:ring-white/10">
						<table className="min-w-full divide-y divide-gray-300 dark:divide-white/10">
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
								{rows.map((row) => (
									<tr key={String(row[columns[0]] ?? row.id ?? Math.random())}>
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
								))}
							</tbody>
						</table>
					</div>

					{totalPages > 1 && (
						<div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
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
									className="rounded border px-2 py-1 disabled:opacity-30 dark:border-gray-600"
								>
									{t("admin.prev")}
								</button>
								<button
									type="button"
									disabled={page >= totalPages - 1}
									onClick={() => setPage((p) => p + 1)}
									className="rounded border px-2 py-1 disabled:opacity-30 dark:border-gray-600"
								>
									{t("admin.next")}
								</button>
							</div>
						</div>
					)}
				</>
			)}
		</section>
	);
}

function formatCell(value: unknown): string {
	if (value == null) return "—";
	if (typeof value === "number" && !Number.isInteger(value))
		return value.toFixed(6);
	return String(value);
}

// ─── Admin Page ──────────────────────────────────────────

export function Admin() {
	const { t } = useTranslation();

	return (
		<div className="space-y-8">
			<div>
				<h3 className="text-base font-semibold text-gray-900 dark:text-white">
					{t("admin.title")}
				</h3>
				<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
					{t("admin.subtitle")}
				</p>
			</div>

			<PlatformOverview />
			<UserManagement />
			<DataExplorer />
		</div>
	);
}

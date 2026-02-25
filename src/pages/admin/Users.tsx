import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth";
import { PageLoader } from "../../components/PageLoader";
import { Button, IconButton } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { formatUSD } from "../../utils/format";

interface UserRow {
	ownerId: string;
	balance: number;
	totalToppedUp: number;
	totalConsumed: number;
	credentialsShared: number;
}

export function Users() {
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
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-base font-semibold text-gray-900 dark:text-white">
					{t("admin.users")}
				</h3>
				<IconButton label="Refresh" size="md" onClick={refetch}>
					<ArrowPathIcon />
				</IconButton>
			</div>

			{loading ? (
				<PageLoader />
			) : !users?.length ? (
				<p className="text-sm text-gray-500 dark:text-gray-400">
					{t("admin.no_users")}
				</p>
			) : (
				<div className="overflow-x-auto shadow ring-1 ring-black/5 rounded-lg dark:ring-white/10">
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
										{formatUSD(u.balance)}
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-sm text-right text-gray-500 dark:text-gray-400">
										{formatUSD(u.totalToppedUp)}
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-sm text-right text-gray-500 dark:text-gray-400">
										{formatUSD(u.totalConsumed)}
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
												<Button
													size="sm"
													onClick={() => handleAdjust(u.ownerId)}
												>
													{t("common.confirm")}
												</Button>
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
											<Button
												variant="secondary"
												size="sm"
												onClick={() => setAdjusting(u.ownerId)}
											>
												{t("admin.adjust")}
											</Button>
										)}
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

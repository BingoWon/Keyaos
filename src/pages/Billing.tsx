import { CreditCardIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";

const PRESETS = [500, 1000, 2500, 5000] as const;

function formatUsd(cents: number) {
	return `$${(cents / 100).toFixed(2)}`;
}

function formatCredits(cents: number) {
	return (cents / 100) * 100;
}

export function Billing() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const {
		data: wallet,
		loading: walletLoading,
	} = useFetch<{ balance: number }>("/api/billing/balance");
	const { data: history, loading: historyLoading } =
		useFetch<
			{
				id: string;
				amount_cents: number;
				credits: number;
				status: string;
				created_at: number;
			}[]
		>("/api/billing/history");
	const [loading, setLoading] = useState(false);

	const handleCheckout = useCallback(
		async (amountCents: number) => {
			setLoading(true);
			try {
				const token = await getToken();
				const res = await fetch("/api/billing/checkout", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ amount: amountCents }),
				});
				const { url } = await res.json();
				if (url) window.location.href = url;
			} finally {
				setLoading(false);
			}
		},
		[getToken],
	);

	return (
		<div>
			<div className="sm:flex sm:items-center sm:justify-between">
				<div>
					<h3 className="text-base font-semibold text-gray-900 dark:text-white">
						{t("billing.title")}
					</h3>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("billing.subtitle")}
					</p>
				</div>
			</div>

			{/* Balance Card */}
			<div className="mt-6 overflow-hidden rounded-lg bg-white shadow dark:bg-white/5">
				<div className="px-4 py-5 sm:p-6">
					<div className="flex items-center gap-4">
						<div className="rounded-md bg-indigo-500 p-3">
							<CreditCardIcon className="size-6 text-white" />
						</div>
						<div>
							<p className="text-sm font-medium text-gray-500 dark:text-gray-400">
								{t("billing.balance")}
							</p>
							<p className="text-3xl font-semibold text-gray-900 dark:text-white">
								{walletLoading ? "—" : (wallet?.balance ?? 0).toFixed(2)}
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Top Up */}
			<div className="mt-6">
				<h4 className="text-sm font-medium text-gray-900 dark:text-white">
					{t("billing.top_up")}
				</h4>
				<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
					{PRESETS.map((cents) => (
						<button
							key={cents}
							type="button"
							disabled={loading}
							onClick={() => handleCheckout(cents)}
							className="relative rounded-lg border border-gray-300 bg-white px-4 py-3 text-center shadow-sm hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500 disabled:opacity-50 dark:border-gray-600 dark:bg-white/5 dark:hover:border-indigo-400"
						>
							<span className="block text-lg font-semibold text-gray-900 dark:text-white">
								{formatUsd(cents)}
							</span>
							<span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
								{formatCredits(cents)} Credits
							</span>
						</button>
					))}
				</div>
				<p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
					{t("billing.rate")}
				</p>
			</div>

			{/* History */}
			<div className="mt-8">
				<h4 className="text-sm font-medium text-gray-900 dark:text-white">
					{t("billing.history")}
				</h4>
				{historyLoading ? (
					<div className="mt-4">
						<PageLoader />
					</div>
				) : !history?.length ? (
					<p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
						{t("billing.no_data")}
					</p>
				) : (
					<div className="mt-3 overflow-hidden rounded-lg border border-gray-200 dark:border-white/10">
						<table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
							<thead className="bg-gray-50 dark:bg-white/5">
								<tr>
									<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
										{t("billing.time")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
										{t("billing.amount")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
										Credits
									</th>
									<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
										{t("billing.status")}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-200 dark:divide-white/10">
								{history.map((p) => (
									<tr key={p.id}>
										<td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
											{new Date(p.created_at).toLocaleString()}
										</td>
										<td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
											{formatUsd(p.amount_cents)}
										</td>
										<td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
											+{p.credits.toFixed(2)}
										</td>
										<td className="whitespace-nowrap px-4 py-3 text-sm">
											<span
												className={
													p.status === "completed"
														? "text-green-600 dark:text-green-400"
														: "text-yellow-600 dark:text-yellow-400"
												}
											>
												{p.status}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}

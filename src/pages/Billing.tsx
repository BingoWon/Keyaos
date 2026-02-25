import { CreditCardIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { PageLoader } from "../components/PageLoader";
import { Button, Input } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { formatSignedUSD, formatUSD } from "../utils/format";

const PRESETS = [500, 1000, 2000, 5000] as const;

export function Billing() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const {
		data: wallet,
		loading: walletLoading,
		refetch: refetchWallet,
	} = useFetch<{ balance: number }>("/api/billing/balance");
	const {
		data: history,
		loading: historyLoading,
		refetch: refetchHistory,
	} = useFetch<
		{
			id: string;
			amount_cents: number;
			credits: number;
			status: string;
			created_at: number;
		}[]
	>("/api/billing/history");
	const [loading, setLoading] = useState(false);
	const [customAmount, setCustomAmount] = useState("");

	useEffect(() => {
		if (searchParams.get("success") === "true") {
			toast.success(t("billing.success"));
			refetchWallet();
			refetchHistory();
			setSearchParams({}, { replace: true });
		} else if (searchParams.get("canceled") === "true") {
			toast(t("billing.canceled"), { icon: "↩" });
			setSearchParams({}, { replace: true });
		}
	}, [searchParams, setSearchParams, refetchWallet, refetchHistory, t]);

	const handleCheckout = useCallback(
		async (amountCents: number) => {
			if (amountCents < 100) return;
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
				const json = await res.json();
				if (json.url) window.location.href = json.url;
				else toast.error(json.error?.message ?? "Checkout failed");
			} catch {
				toast.error("Network error");
			} finally {
				setLoading(false);
			}
		},
		[getToken],
	);

	const customCents = Math.round(Number.parseFloat(customAmount || "0") * 100);

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
			<div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-white/5">
				<div className="flex items-center gap-4">
					<div className="rounded-lg bg-brand-500/10 p-3 dark:bg-brand-500/15">
						<CreditCardIcon className="size-6 text-brand-500" />
					</div>
					<div>
						<p className="text-sm font-medium text-gray-500 dark:text-gray-400">
							{t("billing.balance")}
						</p>
						<p className="text-3xl font-semibold text-gray-900 dark:text-white">
							{walletLoading ? "$—" : formatUSD(wallet?.balance ?? 0)}
						</p>
					</div>
				</div>
			</div>

			{/* Top Up */}
			<div className="mt-6">
				<h4 className="text-sm font-medium text-gray-900 dark:text-white">
					{t("billing.top_up")}
				</h4>

				{/* Preset buttons */}
				<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
					{PRESETS.map((cents) => (
						<button
							key={cents}
							type="button"
							disabled={loading}
							onClick={() => handleCheckout(cents)}
							className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-center transition-colors hover:border-brand-500 hover:ring-1 hover:ring-brand-500/30 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-brand-400"
						>
							<span className="block text-lg font-semibold text-gray-900 dark:text-white">
								${(cents / 100).toFixed(0)}
							</span>
						</button>
					))}
				</div>

				{/* Custom amount */}
				<div className="mt-3 flex gap-3">
					<div className="relative flex-1">
						<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
							$
						</span>
						<Input
							type="number"
							min="1"
							step="1"
							placeholder={t("billing.custom_placeholder")}
							value={customAmount}
							onChange={(e) => setCustomAmount(e.target.value)}
							className="pl-7"
						/>
					</div>
					<Button
						disabled={loading || customCents < 100}
						onClick={() => handleCheckout(customCents)}
					>
						{t("billing.top_up")}
					</Button>
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
					<div className="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
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
										<td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
											{formatSignedUSD(p.credits)}
										</td>
										<td className="whitespace-nowrap px-4 py-3 text-sm">
											<span
												className={
													p.status === "completed"
														? "text-green-600 dark:text-green-400"
														: p.status === "expired"
															? "text-gray-400 dark:text-gray-500"
															: "text-yellow-600 dark:text-yellow-400"
												}
											>
												{t(`billing.status_${p.status}`)}
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

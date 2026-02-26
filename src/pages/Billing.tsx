import {
	ArrowPathIcon,
	BanknotesIcon,
	CreditCardIcon,
	ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { PageLoader } from "../components/PageLoader";
import { Badge, Button, Input } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { formatSignedUSD, formatUSD } from "../utils/format";

const PRESETS = [500, 1000, 2000, 5000] as const;
const THRESHOLD_PRESETS = [5, 10, 25] as const;
const TOPUP_PRESETS = [10, 20, 50] as const;

interface AutoTopUpConfig {
	enabled: boolean;
	threshold?: number;
	amountCents?: number;
	hasCard: boolean;
	consecutiveFailures?: number;
	pausedReason?: string | null;
}

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
			type: string;
			amount_cents: number;
			credits: number;
			status: string;
			created_at: number;
		}[]
	>("/api/billing/history");
	const {
		data: autoConfig,
		loading: autoLoading,
		refetch: refetchAuto,
	} = useFetch<AutoTopUpConfig>("/api/billing/auto-topup");

	const [loading, setLoading] = useState(false);
	const [customAmount, setCustomAmount] = useState("");

	const [autoEnabled, setAutoEnabled] = useState(false);
	const [autoThreshold, setAutoThreshold] = useState("5");
	const [autoAmount, setAutoAmount] = useState("10");
	const [autoSaving, setAutoSaving] = useState(false);

	useEffect(() => {
		if (autoConfig) {
			setAutoEnabled(autoConfig.enabled);
			if (autoConfig.threshold) setAutoThreshold(String(autoConfig.threshold));
			if (autoConfig.amountCents)
				setAutoAmount(String(autoConfig.amountCents / 100));
		}
	}, [autoConfig]);

	useEffect(() => {
		if (searchParams.get("success") === "true") {
			toast.success(t("billing.success"));
			refetchWallet();
			refetchHistory();
			refetchAuto();
			setSearchParams({}, { replace: true });
		} else if (searchParams.get("canceled") === "true") {
			toast(t("billing.canceled"), { icon: "↩" });
			setSearchParams({}, { replace: true });
		}
	}, [
		searchParams,
		setSearchParams,
		refetchWallet,
		refetchHistory,
		refetchAuto,
		t,
	]);

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

	const handleAutoSave = useCallback(
		async (enabledOverride?: boolean) => {
			const enabled = enabledOverride ?? autoEnabled;
			setAutoSaving(true);
			try {
				const token = await getToken();
				const res = await fetch("/api/billing/auto-topup", {
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						enabled,
						threshold: Number.parseFloat(autoThreshold),
						amountCents: Math.round(Number.parseFloat(autoAmount) * 100),
					}),
				});
				const json = await res.json();
				if (json.ok) {
					toast.success(t("billing.auto_topup_saved"));
					refetchAuto();
				} else {
					if (enabledOverride !== undefined) setAutoEnabled(!enabled);
					toast.error(json.error?.message ?? "Failed");
				}
			} catch {
				if (enabledOverride !== undefined) setAutoEnabled(!enabled);
				toast.error("Network error");
			} finally {
				setAutoSaving(false);
			}
		},
		[getToken, autoEnabled, autoThreshold, autoAmount, refetchAuto, t],
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

			{/* Buy Credits + Auto Top-Up */}
			<div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
				{/* Buy Credits */}
				<div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-white/5">
					<div className="flex items-center gap-3">
						<div className="rounded-lg bg-brand-500/10 p-2.5 dark:bg-brand-500/15">
							<BanknotesIcon className="size-5 text-brand-500" />
						</div>
						<div>
							<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
								{t("billing.buy_credits")}
							</h4>
							<p className="text-xs text-gray-500 dark:text-gray-400">
								{t("billing.buy_credits_desc")}
							</p>
						</div>
					</div>

					<div className="mt-4 space-y-3">
						<div className="flex items-center gap-2">
							<div className="relative w-full max-w-40">
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
								{t("billing.buy_credits")}
							</Button>
						</div>
						<div className="flex flex-wrap gap-2">
							{PRESETS.map((cents) => (
								<button
									key={cents}
									type="button"
									disabled={loading}
									onClick={() => handleCheckout(cents)}
									className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-brand-500/30 hover:bg-brand-500/10 hover:text-brand-600 disabled:opacity-50 dark:border-white/10 dark:text-gray-400 dark:hover:border-brand-500/30 dark:hover:bg-brand-500/15 dark:hover:text-brand-400"
								>
									${(cents / 100).toFixed(0)}
								</button>
							))}
						</div>
						<p className="text-xs text-gray-400 dark:text-gray-500">
							{t("billing.rate")}
						</p>
					</div>
				</div>

				{/* Auto Top-Up */}
				<div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-white/5">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="rounded-lg bg-brand-500/10 p-2.5 dark:bg-brand-500/15">
								<ArrowPathIcon className="size-5 text-brand-500" />
							</div>
							<div>
								<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
									{t("billing.auto_topup")}
								</h4>
								<p className="text-xs text-gray-500 dark:text-gray-400">
									{t("billing.auto_topup_desc")}
								</p>
							</div>
						</div>
						<label className="relative inline-flex cursor-pointer items-center">
							<input
								type="checkbox"
								className="peer sr-only"
								checked={autoEnabled}
								disabled={autoLoading || autoSaving || !autoConfig?.hasCard}
								onChange={(e) => {
									const v = e.target.checked;
									setAutoEnabled(v);
									handleAutoSave(v);
								}}
							/>
							<div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:size-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-500 peer-checked:after:translate-x-full peer-disabled:opacity-50 dark:bg-gray-700 dark:after:bg-gray-300 dark:peer-checked:after:bg-white" />
						</label>
					</div>

					{autoConfig?.pausedReason && (
						<div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
							<ExclamationTriangleIcon className="size-4 shrink-0" />
							{t("billing.auto_topup_paused", {
								reason: autoConfig.pausedReason,
							})}
						</div>
					)}

					{autoLoading ? (
						<div className="mt-4">
							<PageLoader />
						</div>
					) : !autoConfig?.hasCard ? (
						<p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
							{t("billing.auto_topup_no_card")}
						</p>
					) : (
						<div className="mt-4 space-y-4">
							<div className="flex flex-col gap-4 sm:flex-row sm:gap-0 sm:divide-x sm:divide-gray-200 sm:dark:divide-white/10">
								<div className="sm:pr-4">
									<span className="text-xs font-medium text-gray-500 dark:text-gray-400">
										{t("billing.auto_topup_threshold")}
									</span>
									<div className="mt-1.5 flex flex-wrap items-center gap-2">
										<div className="relative w-24">
											<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
												$
											</span>
											<Input
												type="number"
												min="1"
												step="1"
												value={autoThreshold}
												onChange={(e) => setAutoThreshold(e.target.value)}
												className="pl-7"
											/>
										</div>
										{THRESHOLD_PRESETS.map((v) => (
											<button
												key={v}
												type="button"
												onClick={() => setAutoThreshold(String(v))}
												className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
													autoThreshold === String(v)
														? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
														: "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
												}`}
											>
												${v}
											</button>
										))}
									</div>
								</div>
								<div className="sm:pl-4">
									<span className="text-xs font-medium text-gray-500 dark:text-gray-400">
										{t("billing.auto_topup_amount")}
									</span>
									<div className="mt-1.5 flex flex-wrap items-center gap-2">
										<div className="relative w-24">
											<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
												$
											</span>
											<Input
												type="number"
												min="5"
												step="1"
												value={autoAmount}
												onChange={(e) => setAutoAmount(e.target.value)}
												className="pl-7"
											/>
										</div>
										{TOPUP_PRESETS.map((v) => (
											<button
												key={v}
												type="button"
												onClick={() => setAutoAmount(String(v))}
												className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
													autoAmount === String(v)
														? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
														: "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
												}`}
											>
												${v}
											</button>
										))}
									</div>
								</div>
							</div>
							<Button
								disabled={autoSaving}
								onClick={() => handleAutoSave()}
								size="sm"
							>
								{t("common.save")}
							</Button>
						</div>
					)}
				</div>
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
										{t("billing.type")}
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
											<Badge variant={p.type === "auto" ? "accent" : "brand"}>
												{t(`billing.type_${p.type || "manual"}`)}
											</Badge>
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

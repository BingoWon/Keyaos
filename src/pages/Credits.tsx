import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ArrowUpTrayIcon,
	BanknotesIcon,
	CreditCardIcon,
	ExclamationTriangleIcon,
	WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Icon } from "@iconify/react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Trans, useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { PageLoader } from "../components/PageLoader";
import { Badge, Button, Input, PromoBanner } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
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

interface PaymentEntry {
	id: string;
	type: string;
	credits: number;
	status: string;
	created_at: number;
}

interface LedgerEntry {
	id: string;
	type: "usage" | "top_up" | "adjustment";
	category: string;
	description: string;
	amount: number;
	created_at: number;
}

type HistoryTab = "ledger" | "payments";

/* ─── Category badges for ledger ─── */

const CATEGORY_CONFIG: Record<
	string,
	{
		icon: typeof ArrowUpTrayIcon;
		colorClass: string;
		bgClass: string;
		labelKey: string;
	}
> = {
	api_spend: {
		icon: ArrowUpTrayIcon,
		colorClass: "text-red-700 dark:text-red-400",
		bgClass: "bg-red-50 dark:bg-red-900/30",
		labelKey: "credits.api_spend",
	},
	credential_earn: {
		icon: ArrowDownTrayIcon,
		colorClass: "text-green-700 dark:text-green-400",
		bgClass: "bg-green-50 dark:bg-green-900/30",
		labelKey: "credits.credential_earn",
	},
	top_up: {
		icon: CreditCardIcon,
		colorClass: "text-blue-700 dark:text-blue-400",
		bgClass: "bg-blue-50 dark:bg-blue-900/30",
		labelKey: "credits.top_up",
	},
	auto_topup: {
		icon: ArrowPathIcon,
		colorClass: "text-violet-700 dark:text-violet-400",
		bgClass: "bg-violet-50 dark:bg-violet-900/30",
		labelKey: "credits.auto_topup_label",
	},
	grant: {
		icon: BanknotesIcon,
		colorClass: "text-emerald-700 dark:text-emerald-400",
		bgClass: "bg-emerald-50 dark:bg-emerald-900/30",
		labelKey: "credits.grant",
	},
	revoke: {
		icon: WrenchScrewdriverIcon,
		colorClass: "text-orange-700 dark:text-orange-400",
		bgClass: "bg-orange-50 dark:bg-orange-900/30",
		labelKey: "credits.revoke",
	},
};

function CategoryBadge({ category }: { category: string }) {
	const { t } = useTranslation();
	const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.api_spend;
	const Ic = config.icon;

	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bgClass} ${config.colorClass}`}
		>
			<Ic className="size-3" />
			{t(config.labelKey)}
		</span>
	);
}

/* ─── Tab buttons ─── */

const tabClass = (active: boolean) =>
	`px-4 py-2 text-sm font-medium transition-colors rounded-t-lg border-b-2 ${
		active
			? "border-brand-500 text-brand-600 dark:text-brand-400"
			: "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
	}`;

/* ─── Main page ─── */

export function Credits() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const formatDateTime = useFormatDateTime();
	const [searchParams, setSearchParams] = useSearchParams();

	const {
		data: wallet,
		loading: walletLoading,
		refetch: refetchWallet,
	} = useFetch<{ balance: number }>("/api/billing/balance");
	const {
		data: payments,
		loading: paymentsLoading,
		refetch: refetchPayments,
	} = useFetch<PaymentEntry[]>("/api/billing/history");
	const {
		data: autoConfig,
		loading: autoLoading,
		refetch: refetchAuto,
	} = useFetch<AutoTopUpConfig>("/api/billing/auto-topup");
	const {
		data: ledger,
		loading: ledgerLoading,
	} = useFetch<LedgerEntry[]>("/api/ledger?limit=200");

	const [loading, setLoading] = useState(false);
	const [customAmount, setCustomAmount] = useState("");

	const [autoEnabled, setAutoEnabled] = useState(false);
	const [autoThreshold, setAutoThreshold] = useState("5");
	const [autoAmount, setAutoAmount] = useState("10");
	const [autoSaving, setAutoSaving] = useState(false);

	const [tab, setTab] = useState<HistoryTab>("payments");

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
			toast.success(t("credits.success"));
			refetchWallet();
			refetchPayments();
			refetchAuto();
			setSearchParams({}, { replace: true });
		} else if (searchParams.get("canceled") === "true") {
			toast(t("credits.canceled"), { icon: "↩" });
			setSearchParams({}, { replace: true });
			getToken().then((token) =>
				fetch("/api/billing/cancel-pending", {
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
				}).then(() => refetchPayments()),
			);
		}
	}, [
		searchParams,
		setSearchParams,
		refetchWallet,
		refetchPayments,
		refetchAuto,
		getToken,
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
					toast.success(t("credits.auto_topup_saved"));
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
						{t("credits.title")}
					</h3>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("credits.subtitle")}
					</p>
				</div>
			</div>

			{/* Promo Banner */}
			<PromoBanner
				title={t("credits.promo_title")}
				description={
					<Trans
						i18nKey="credits.promo_desc"
						components={{
							OpenRouterLink: (
								// biome-ignore lint/a11y/useAnchorContent: Trans injects children at runtime
								<a
									href="https://openrouter.ai/docs/faq#pricing-and-fees"
									target="_blank"
									rel="noopener noreferrer"
									className="font-semibold text-white hover:text-white/90 underline underline-offset-4 decoration-white/40 hover:decoration-white/80 transition-colors"
								/>
							),
						}}
					/>
				}
			/>

			{/* Balance Card */}
			<div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-white/5">
				<div className="flex items-center gap-4">
					<div className="rounded-lg bg-brand-500/10 p-3 dark:bg-brand-500/15">
						<CreditCardIcon className="size-6 text-brand-500" />
					</div>
					<div>
						<p className="text-sm font-medium text-gray-500 dark:text-gray-400">
							{t("credits.balance")}
						</p>
						<p className="text-3xl font-semibold text-gray-900 dark:text-white">
							{walletLoading ? "$—" : formatUSD(wallet?.balance ?? 0)}
						</p>
					</div>
				</div>
			</div>

			{/* Buy Credits + Auto Top-Up */}
			<div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Buy Credits */}
				<div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-white/5">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="rounded-lg bg-brand-500/10 p-2.5 dark:bg-brand-500/15">
								<BanknotesIcon className="size-5 text-brand-500" />
							</div>
							<div>
								<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
									{t("credits.buy_credits")}
								</h4>
								<p className="text-xs text-gray-500 dark:text-gray-400">
									{t("credits.buy_credits_desc")}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-1.5">
							<Icon icon="logos:visaelectron" height={18} />
							<Icon icon="logos:mastercard" height={18} />
							<Icon icon="logos:amex-digital" height={18} />
							<Icon icon="logos:jcb" height={18} />
							<Icon icon="logos:unionpay" height={18} />
							<Icon icon="simple-icons:alipay" height={18} color="#1677FF" />
						</div>
					</div>

					<div className="mt-4 space-y-3">
						<div className="flex items-center gap-2">
							<div className="relative w-full max-w-50">
								<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
									$
								</span>
								<Input
									type="number"
									min="1"
									step="1"
									placeholder={t("credits.custom_placeholder")}
									value={customAmount}
									onChange={(e) => setCustomAmount(e.target.value)}
									className="pl-7"
								/>
							</div>
							<Button
								disabled={loading || customCents < 100}
								onClick={() => handleCheckout(customCents)}
							>
								{t("credits.buy_credits")}
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
							{t("credits.rate")}
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
									{t("credits.auto_topup")}
								</h4>
								<p className="text-xs text-gray-500 dark:text-gray-400">
									{t("credits.auto_topup_desc")}
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
							{t("credits.auto_topup_paused", {
								reason: autoConfig.pausedReason,
							})}
						</div>
					)}

					{!autoConfig?.pausedReason &&
						(autoConfig?.consecutiveFailures ?? 0) > 0 && (
							<div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
								<ExclamationTriangleIcon className="size-4 shrink-0" />
								{t("credits.auto_topup_failing", {
									count: autoConfig?.consecutiveFailures,
									delay: autoConfig?.consecutiveFailures === 1 ? "1h" : "24h",
								})}
							</div>
						)}

					{autoLoading ? (
						<div className="mt-4">
							<PageLoader />
						</div>
					) : !autoConfig?.hasCard ? (
						<p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
							{t("credits.auto_topup_no_card")}
						</p>
					) : (
						<div className="mt-3 space-y-3">
							<div className="flex flex-col gap-4 sm:flex-row sm:gap-0 sm:divide-x sm:divide-gray-200 sm:dark:divide-white/10">
								<div className="sm:pr-4">
									<span className="text-xs font-medium text-gray-500 dark:text-gray-400">
										{t("credits.auto_topup_threshold")}
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
										{t("credits.auto_topup_amount")}
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

			{/* History — tabbed */}
			<div className="mt-8">
				<div className="flex gap-1 border-b border-gray-200 dark:border-white/10">
					<button
						type="button"
						onClick={() => setTab("payments")}
						className={tabClass(tab === "payments")}
					>
						{t("credits.tab_payments")}
					</button>
					<button
						type="button"
						onClick={() => setTab("ledger")}
						className={tabClass(tab === "ledger")}
					>
						{t("credits.tab_transactions")}
					</button>
				</div>

				{tab === "payments" && (
					<PaymentsTable
						entries={payments}
						loading={paymentsLoading}
						formatDateTime={formatDateTime}
					/>
				)}
				{tab === "ledger" && (
					<LedgerTable
						entries={ledger}
						loading={ledgerLoading}
						formatDateTime={formatDateTime}
					/>
				)}
			</div>
		</div>
	);
}

/* ─── Ledger (transaction history) table ─── */

function LedgerTable({
	entries,
	loading,
	formatDateTime,
}: {
	entries: LedgerEntry[] | null;
	loading: boolean;
	formatDateTime: (ts: number) => string;
}) {
	const { t } = useTranslation();

	if (loading)
		return (
			<div className="mt-5">
				<PageLoader />
			</div>
		);

	if (!entries?.length)
		return (
			<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
				{t("credits.no_transactions")}
			</p>
		);

	return (
		<div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
			<table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
				<thead className="bg-gray-50 dark:bg-white/5">
					<tr>
						<th className="py-3 pl-4 pr-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 sm:pl-6">
							{t("credits.time")}
						</th>
						<th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
							{t("credits.type")}
						</th>
						<th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
							{t("credits.description")}
						</th>
						<th className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 sm:pr-6">
							{t("credits.amount")}
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-200 dark:divide-white/5">
					{entries.map((e) => (
						<tr key={`${e.type}-${e.id}`}>
							<td className="whitespace-nowrap py-3 pl-4 pr-3 text-sm text-gray-500 dark:text-gray-400 sm:pl-6">
								{formatDateTime(e.created_at)}
							</td>
							<td className="whitespace-nowrap px-3 py-3">
								<CategoryBadge category={e.category} />
							</td>
							<td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900 dark:text-white">
								{e.description ||
									(e.type === "adjustment"
										? t("credits.admin_adjustment")
										: "—")}
							</td>
							<td
								className={`whitespace-nowrap px-3 py-3 text-sm text-right font-medium sm:pr-6 ${
									e.amount > 0
										? "text-green-600 dark:text-green-400"
										: e.amount < 0
											? "text-red-600 dark:text-red-400"
											: "text-gray-400 dark:text-gray-500"
								}`}
							>
								{formatSignedUSD(e.amount)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/* ─── Payments table ─── */

function PaymentsTable({
	entries,
	loading,
	formatDateTime,
}: {
	entries: PaymentEntry[] | null;
	loading: boolean;
	formatDateTime: (ts: number) => string;
}) {
	const { t } = useTranslation();

	if (loading)
		return (
			<div className="mt-5">
				<PageLoader />
			</div>
		);

	if (!entries?.length)
		return (
			<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
				{t("credits.no_payments")}
			</p>
		);

	return (
		<div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
			<table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
				<thead className="bg-gray-50 dark:bg-white/5">
					<tr>
						<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
							{t("credits.time")}
						</th>
						<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
							{t("credits.amount")}
						</th>
						<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
							{t("credits.type")}
						</th>
						<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
							{t("credits.status")}
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-200 dark:divide-white/10">
					{entries.map((p) => (
						<tr key={p.id}>
							<td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
								{formatDateTime(p.created_at)}
							</td>
							<td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
								{formatSignedUSD(p.credits)}
							</td>
							<td className="whitespace-nowrap px-4 py-3 text-sm">
								<Badge variant={p.type === "auto" ? "accent" : "brand"}>
									{t(`credits.type_${p.type || "manual"}`)}
								</Badge>
							</td>
							<td className="whitespace-nowrap px-4 py-3 text-sm">
								<span
									className={
										p.status === "completed"
											? "text-green-600 dark:text-green-400"
											: p.status === "pending"
												? "text-yellow-600 dark:text-yellow-400"
												: p.status === "failed"
													? "text-red-600 dark:text-red-400"
													: "text-gray-400 dark:text-gray-500"
									}
								>
									{t(`credits.status_${p.status}`)}
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

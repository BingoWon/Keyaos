import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ArrowUpTrayIcon,
	BanknotesIcon,
	BookOpenIcon,
	CreditCardIcon,
	ExclamationTriangleIcon,
	GiftIcon,
	WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Icon } from "@iconify/react";
import confetti from "canvas-confetti";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Trans, useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { Pagination } from "../components/Pagination";
import { RefreshControl } from "../components/RefreshControl";
import { Badge, Button, Input, PromoBanner } from "../components/ui";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { invalidateCache, useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import { TOKENS, type TokenName } from "../utils/colors";
import { formatSignedUSD, formatUSD } from "../utils/format";
import { toastApiError } from "../utils/toast-error";

const CONFETTI_COLORS = [
	"#ff6b6b",
	"#ffd93d",
	"#6bcb77",
	"#4d96ff",
	"#c084fc",
	"#ff85a2",
	"#38bdf8",
];

function fireConfetti() {
	confetti({
		particleCount: 80,
		spread: 100,
		origin: { x: 0.5, y: 0.4 },
		colors: CONFETTI_COLORS,
		startVelocity: 35,
		gravity: 0.8,
		ticks: 200,
	});
	setTimeout(() => {
		confetti({
			particleCount: 50,
			angle: 60,
			spread: 70,
			origin: { x: 0.15, y: 0.5 },
			colors: CONFETTI_COLORS,
			startVelocity: 30,
		});
		confetti({
			particleCount: 50,
			angle: 120,
			spread: 70,
			origin: { x: 0.85, y: 0.5 },
			colors: CONFETTI_COLORS,
			startVelocity: 30,
		});
	}, 150);
}

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

interface DepositEntry {
	id: string;
	amount: number;
	source: string;
	status: string;
	created_at: number;
}

interface TransactionEntry {
	id: string;
	type: "log" | "top_up" | "adjustment" | "gift_card";
	category: string;
	description: string;
	amount: number;
	created_at: number;
}

type HistoryTab = "deposits" | "transactions";

/* ─── Category badges for transactions ─── */

const CATEGORY_CONFIG: Record<
	string,
	{ icon: typeof ArrowUpTrayIcon; color: TokenName; labelKey: string }
> = {
	api_spend: {
		icon: ArrowUpTrayIcon,
		color: "red",
		labelKey: "credits.api_spend",
	},
	credential_earn: {
		icon: ArrowDownTrayIcon,
		color: "green",
		labelKey: "credits.credential_earn",
	},
	top_up: { icon: CreditCardIcon, color: "blue", labelKey: "credits.top_up" },
	auto_topup: {
		icon: ArrowPathIcon,
		color: "violet",
		labelKey: "credits.auto_topup_label",
	},
	gift_card: {
		icon: GiftIcon,
		color: "green",
		labelKey: "credits.gift_card",
	},
	grant: { icon: BanknotesIcon, color: "teal", labelKey: "credits.grant" },
	revoke: {
		icon: WrenchScrewdriverIcon,
		color: "amber",
		labelKey: "credits.revoke",
	},
};

function CategoryBadge({ category }: { category: string }) {
	const { t } = useTranslation();
	const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.api_spend;
	const Ic = config.icon;

	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TOKENS[config.color].soft}`}
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

	const [tab, setTab] = useState<HistoryTab>("deposits");
	const [loading, setLoading] = useState(false);
	const [customAmount, setCustomAmount] = useState("");
	const [redeemCode, setRedeemCode] = useState("");
	const [redeeming, setRedeeming] = useState(false);
	const [autoEnabled, setAutoEnabled] = useState(false);
	const [autoThreshold, setAutoThreshold] = useState("5");
	const [autoAmount, setAutoAmount] = useState("10");
	const [autoSaving, setAutoSaving] = useState(false);

	const {
		data: wallet,
		loading: walletLoading,
		refetch: refetchWallet,
	} = useFetch<{ balance: number }>("/api/credits/balance");
	const [paymentsPage, setPaymentsPage] = useState(1);
	const [paymentsSize, setPaymentsSize] = useState(20);
	const [txPage, setTxPage] = useState(1);
	const [txSize, setTxSize] = useState(20);

	const {
		data: depositsResult,
		loading: depositsLoading,
		refetch: refetchDeposits,
	} = useFetch<{ items: DepositEntry[]; total: number }>(
		`/api/credits/deposits?page=${paymentsPage}&limit=${paymentsSize}`,
	);
	const {
		data: autoConfig,
		loading: autoLoading,
		refetch: refetchAuto,
	} = useFetch<AutoTopUpConfig>("/api/credits/auto-topup");
	const {
		data: txResult,
		loading: transactionsLoading,
		refetch: refetchTx,
	} = useFetch<{
		items: TransactionEntry[];
		total: number;
	}>(`/api/credits/transactions?page=${txPage}&limit=${txSize}`, {
		skip: tab !== "transactions",
	});

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
			refetchDeposits();
			refetchAuto();
			setSearchParams({}, { replace: true });
		} else if (searchParams.get("canceled") === "true") {
			toast(t("credits.canceled"), { icon: "↩" });
			setSearchParams({}, { replace: true });
			getToken().then((token) =>
				fetch("/api/credits/cancel-pending", {
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
				}).then(() => refetchDeposits()),
			);
		}
	}, [
		searchParams,
		setSearchParams,
		refetchWallet,
		refetchDeposits,
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
				const res = await fetch("/api/credits/checkout", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ amount: amountCents }),
				});
				const json = await res.json();
				if (json.url) window.location.href = json.url;
				else toastApiError(json, t);
			} catch {
				toast.error(t("common.network_error"));
			} finally {
				setLoading(false);
			}
		},
		[getToken, t],
	);

	const handleAutoSave = useCallback(
		async (enabledOverride?: boolean) => {
			const enabled = enabledOverride ?? autoEnabled;
			setAutoSaving(true);
			try {
				const token = await getToken();
				const res = await fetch("/api/credits/auto-topup", {
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
					toastApiError(json, t);
				}
			} catch {
				if (enabledOverride !== undefined) setAutoEnabled(!enabled);
				toast.error(t("common.network_error"));
			} finally {
				setAutoSaving(false);
			}
		},
		[getToken, autoEnabled, autoThreshold, autoAmount, refetchAuto, t],
	);

	const handleRedeem = useCallback(async () => {
		const code = redeemCode.trim();
		if (!code) return;
		setRedeeming(true);
		try {
			const token = await getToken();
			const res = await fetch("/api/credits/redeem", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ code }),
			});
			const json = await res.json();
			if (json.ok) {
				toast.success(
					t("credits.redeem_success", { amount: formatUSD(json.amount) }),
				);
				fireConfetti();
				setRedeemCode("");
				invalidateCache("/api/credits/balance");
				refetchWallet();
				refetchTx();
			} else {
				toast.error(t("credits.redeem_error_invalid"));
			}
		} catch {
			toast.error(t("common.network_error"));
		} finally {
			setRedeeming(false);
		}
	}, [redeemCode, getToken, refetchWallet, refetchTx, t]);

	const isRefreshing =
		walletLoading || depositsLoading || autoLoading || transactionsLoading;
	const refetchAll = useCallback(() => {
		refetchWallet();
		refetchDeposits();
		refetchAuto();
		if (tab === "transactions") refetchTx();
	}, [refetchWallet, refetchDeposits, refetchAuto, tab, refetchTx]);

	const lastUpdated = useAutoRefresh(refetchAll, depositsResult);

	const customCents = Math.round(Number.parseFloat(customAmount || "0") * 100);

	return (
		<div>
			<div className="sm:flex sm:items-center">
				<div className="sm:flex-auto">
					<h1 className="text-xl font-semibold text-gray-900 dark:text-white">
						{t("credits.title")}
					</h1>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("credits.subtitle")}
					</p>
				</div>
				<div className="mt-4 sm:mt-0 flex items-end gap-3">
					<RefreshControl
						loading={isRefreshing}
						lastUpdated={lastUpdated}
						onRefresh={refetchAll}
					/>
				</div>
			</div>

			{/* Promo Banner */}
			<PromoBanner
				id="credits"
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

			{/* Balance + Redeem */}
			<div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
				{/* Balance Card */}
				<div className="lg:col-span-2 flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-white/5">
					<div className="flex items-center justify-between">
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
					<div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
						<a
							href="/docs/credits#what-are-credits"
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-gray-400 hover:text-brand-500 transition-colors dark:text-gray-500 dark:hover:text-brand-400"
						>
							{t("credits.faq_what_are_credits", "What are Credits?")} →
						</a>
						<a
							href="/docs/credits#what-happens-when-credits-run-out"
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-gray-400 hover:text-brand-500 transition-colors dark:text-gray-500 dark:hover:text-brand-400"
						>
							{t(
								"credits.faq_credits_run_out",
								"What happens when credits run out?",
							)}{" "}
							→
						</a>
					</div>
				</div>

				{/* Redeem Gift Card */}
				<div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-white/5">
					<div className="flex items-center gap-3">
						<div className="rounded-lg bg-brand-500/10 p-2.5 dark:bg-brand-500/15">
							<GiftIcon className="size-5 text-brand-500" />
						</div>
						<div>
							<h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
								{t("credits.redeem_title")}
								<a
									href="/docs/credits#gift-cards"
									target="_blank"
									rel="noopener noreferrer"
									className="text-gray-300 hover:text-brand-500 transition-colors dark:text-gray-600 dark:hover:text-brand-400"
									title="Documentation"
								>
									<BookOpenIcon className="size-3.5" />
								</a>
							</h4>
							<p className="text-xs text-gray-500 dark:text-gray-400">
								{t("credits.redeem_desc")}
							</p>
						</div>
					</div>
					<div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
						<div className="relative flex-1">
							<Input
								placeholder={t("credits.redeem_placeholder")}
								value={redeemCode}
								onChange={(e) => setRedeemCode(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleRedeem();
									if (e.key === "Escape") setRedeemCode("");
								}}
								className="font-mono uppercase tracking-wider pr-8"
							/>
							{redeemCode && (
								<button
									type="button"
									onClick={() => setRedeemCode("")}
									className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
								>
									<svg
										className="size-4"
										viewBox="0 0 20 20"
										fill="currentColor"
										aria-label="Clear"
										role="img"
									>
										<path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
									</svg>
								</button>
							)}
						</div>
						<Button
							disabled={redeeming || !redeemCode.trim()}
							onClick={handleRedeem}
							className="w-full sm:w-auto"
						>
							{t("credits.redeem")}
						</Button>
					</div>
				</div>
			</div>

			{/* Buy Credits + Auto Top-Up */}
			<div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Buy Credits */}
				<div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-white/5">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
							<div className="relative w-full sm:max-w-50">
								<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
									$
								</span>
								<Input
									type="number"
									min="1"
									step="0.01"
									placeholder={t("credits.custom_placeholder")}
									value={customAmount}
									onChange={(e) => setCustomAmount(e.target.value)}
									className="pl-7"
								/>
							</div>
							<Button
								disabled={loading || customCents < 100}
								onClick={() => handleCheckout(customCents)}
								className="w-full sm:w-auto"
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
								<h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
									{t("credits.auto_topup")}
									<a
										href="/docs/credits#auto-top-up"
										target="_blank"
										rel="noopener noreferrer"
										className="text-gray-300 hover:text-brand-500 transition-colors dark:text-gray-600 dark:hover:text-brand-400"
										title="Documentation"
									>
										<BookOpenIcon className="size-3.5" />
									</a>
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
						<div
							className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${TOKENS.amber.soft}`}
						>
							<ExclamationTriangleIcon className="size-4 shrink-0" />
							{t("credits.auto_topup_paused", {
								reason: autoConfig.pausedReason,
							})}
						</div>
					)}

					{!autoConfig?.pausedReason &&
						(autoConfig?.consecutiveFailures ?? 0) > 0 && (
							<div
								className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${TOKENS.amber.soft}`}
							>
								<ExclamationTriangleIcon className="size-4 shrink-0" />
								{t("credits.auto_topup_failing", {
									count: autoConfig?.consecutiveFailures,
									delay: autoConfig?.consecutiveFailures === 1 ? "1h" : "24h",
								})}
							</div>
						)}

					{autoLoading ? (
						<div className="mt-4 space-y-3">
							<div className="h-10 w-full rounded-lg bg-gray-200 dark:bg-white/10 animate-pulse" />
							<div className="h-10 w-full rounded-lg bg-gray-100 dark:bg-white/5 animate-pulse" />
						</div>
					) : !autoConfig?.hasCard ? (
						<div
							className={`mt-3 rounded-lg border px-4 py-3 text-sm ${TOKENS.amber.outline}`}
						>
							{t("credits.auto_topup_no_card")}
						</div>
					) : (
						<div className="mt-3 space-y-3">
							<div className="flex flex-col gap-4 sm:flex-row sm:gap-0 sm:divide-x sm:divide-gray-200 sm:dark:divide-white/10">
								<div className="flex-1 sm:pr-4">
									<span className="text-xs font-medium text-gray-500 dark:text-gray-400">
										{t("credits.auto_topup_threshold")}
									</span>
									<div className="mt-1.5 flex flex-wrap items-center gap-2">
										<div className="relative flex-1 min-w-20">
											<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
												$
											</span>
											<Input
												type="number"
												min="1"
												step="0.01"
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
								<div className="flex-1 sm:pl-4">
									<span className="text-xs font-medium text-gray-500 dark:text-gray-400">
										{t("credits.auto_topup_amount")}
									</span>
									<div className="mt-1.5 flex flex-wrap items-center gap-2">
										<div className="relative flex-1 min-w-20">
											<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
												$
											</span>
											<Input
												type="number"
												min="5"
												step="0.01"
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
						onClick={() => setTab("deposits")}
						className={tabClass(tab === "deposits")}
					>
						{t("credits.tab_deposits")}
					</button>
					<button
						type="button"
						onClick={() => setTab("transactions")}
						className={tabClass(tab === "transactions")}
					>
						{t("credits.tab_transactions")}
					</button>
				</div>

				{tab === "deposits" && (
					<DepositsTable
						items={depositsResult?.items ?? null}
						total={depositsResult?.total ?? 0}
						loading={depositsLoading}
						formatDateTime={formatDateTime}
						page={paymentsPage}
						pageSize={paymentsSize}
						onPageChange={setPaymentsPage}
						onPageSizeChange={(s) => {
							setPaymentsSize(s);
							setPaymentsPage(1);
						}}
					/>
				)}
				{tab === "transactions" && (
					<TransactionsTable
						items={txResult?.items ?? null}
						total={txResult?.total ?? 0}
						loading={transactionsLoading}
						formatDateTime={formatDateTime}
						page={txPage}
						pageSize={txSize}
						onPageChange={setTxPage}
						onPageSizeChange={(s) => {
							setTxSize(s);
							setTxPage(1);
						}}
					/>
				)}
			</div>
		</div>
	);
}

/* ─── Shared props for paginated tables ─── */

interface PaginatedTableProps {
	total: number;
	loading: boolean;
	formatDateTime: (ts: number) => string;
	page: number;
	pageSize: number;
	onPageChange: (p: number) => void;
	onPageSizeChange: (s: number) => void;
}

/* ─── Transaction history table ─── */

function TransactionsTable({
	items,
	total,
	loading,
	formatDateTime,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
}: PaginatedTableProps & { items: TransactionEntry[] | null }) {
	const { t } = useTranslation();
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	if (loading && !items?.length)
		return (
			<div className="mt-5 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
				<div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
					{Array.from({ length: 6 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<div key={i} className="flex items-center gap-4 px-5 py-2.5">
							<div className="h-4 w-24 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
							<div className="h-4 w-32 rounded bg-gray-100 dark:bg-white/5 animate-pulse flex-1" />
							<div className="h-4 w-16 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
						</div>
					))}
				</div>
			</div>
		);

	if (!items?.length)
		return (
			<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
				{t("credits.no_transactions")}
			</p>
		);

	return (
		<>
			<div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
				<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
					<thead>
						<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
							<th className="py-2.5 pl-4 pr-2 sm:pl-5">{t("credits.time")}</th>
							<th className="px-2 py-2.5">{t("credits.type")}</th>
							<th className="px-2 py-2.5">{t("credits.description")}</th>
							<th className="py-2.5 pl-2 pr-4 text-right sm:pr-5">
								{t("credits.amount")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
						{items.map((e) => (
							<tr
								key={`${e.type}-${e.id}`}
								className="even:bg-gray-50/50 dark:even:bg-white/[0.015]"
							>
								<td className="whitespace-nowrap py-2.5 pl-4 pr-2 text-sm text-gray-500 dark:text-gray-400 sm:pl-5">
									{formatDateTime(e.created_at)}
								</td>
								<td className="whitespace-nowrap px-2 py-2.5">
									<CategoryBadge category={e.category} />
								</td>
								<td className="whitespace-nowrap px-2 py-2.5 text-sm text-gray-900 dark:text-white">
									{e.description ||
										(e.type === "adjustment"
											? t("credits.admin_adjustment")
											: "—")}
								</td>
								<td
									className={`whitespace-nowrap py-2.5 pl-2 pr-4 text-sm text-right font-medium sm:pr-5 ${
										e.amount > 0
											? TOKENS.green.text
											: e.amount < 0
												? TOKENS.red.text
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
			<div className="mt-3 flex items-center justify-between">
				<span className="text-xs text-gray-500 dark:text-gray-400">
					{total.toLocaleString()} {t("credits.tab_transactions").toLowerCase()}
				</span>
				<Pagination
					page={page}
					totalPages={totalPages}
					onChange={onPageChange}
					pageSize={pageSize}
					onPageSizeChange={onPageSizeChange}
				/>
			</div>
		</>
	);
}

/* ─── Source badge config for deposits ─── */

const SOURCE_CONFIG: Record<
	string,
	{ variant: "brand" | "accent" | "success" | "info"; labelKey: string }
> = {
	manual: { variant: "brand", labelKey: "credits.source_manual" },
	auto: { variant: "accent", labelKey: "credits.source_auto" },
	gift_card: { variant: "success", labelKey: "credits.source_gift_card" },
	grant: { variant: "info", labelKey: "credits.source_grant" },
};

/* ─── Deposits table ─── */

function DepositsTable({
	items,
	total,
	loading,
	formatDateTime,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
}: PaginatedTableProps & { items: DepositEntry[] | null }) {
	const { t } = useTranslation();
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	if (loading && !items?.length)
		return (
			<div className="mt-5 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
				<div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
					{Array.from({ length: 5 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<div key={i} className="flex items-center gap-4 px-5 py-2.5">
							<div className="h-4 w-20 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
							<div className="h-4 w-16 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
							<div className="h-5 w-14 rounded-full bg-gray-100 dark:bg-white/5 animate-pulse" />
							<div className="h-4 w-24 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
						</div>
					))}
				</div>
			</div>
		);

	if (!items?.length)
		return (
			<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
				{t("credits.no_deposits")}
			</p>
		);

	return (
		<>
			<div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
				<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
					<thead>
						<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
							<th className="py-2.5 pl-4 pr-2 sm:pl-5">{t("credits.time")}</th>
							<th className="px-2 py-2.5">{t("credits.source")}</th>
							<th className="px-2 py-2.5">{t("credits.status")}</th>
							<th className="py-2.5 pl-2 pr-4 text-right sm:pr-5">
								{t("credits.amount")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
						{items.map((d) => {
							const src = SOURCE_CONFIG[d.source] ?? SOURCE_CONFIG.manual;
							return (
								<tr
									key={d.id}
									className="even:bg-gray-50/50 dark:even:bg-white/[0.015]"
								>
									<td className="whitespace-nowrap py-2.5 pl-4 pr-2 text-sm text-gray-500 dark:text-gray-400 sm:pl-5">
										{formatDateTime(d.created_at)}
									</td>
									<td className="whitespace-nowrap px-2 py-2.5 text-sm">
										<Badge variant={src.variant}>{t(src.labelKey)}</Badge>
									</td>
									<td className="whitespace-nowrap px-2 py-2.5 text-sm">
										<span
											className={
												d.status === "completed"
													? TOKENS.green.text
													: d.status === "pending"
														? TOKENS.yellow.text
														: d.status === "failed"
															? TOKENS.red.text
															: "text-gray-400 dark:text-gray-500"
											}
										>
											{t(`credits.status_${d.status}`)}
										</span>
									</td>
									<td
										className={`whitespace-nowrap py-2.5 pl-2 pr-4 text-sm text-right font-medium sm:pr-5 ${TOKENS.green.text}`}
									>
										{formatSignedUSD(d.amount)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<div className="mt-3 flex items-center justify-between">
				<span className="text-xs text-gray-500 dark:text-gray-400">
					{total.toLocaleString()} {t("credits.tab_deposits").toLowerCase()}
				</span>
				<Pagination
					page={page}
					totalPages={totalPages}
					onChange={onPageChange}
					pageSize={pageSize}
					onPageSizeChange={onPageSizeChange}
				/>
			</div>
		</>
	);
}

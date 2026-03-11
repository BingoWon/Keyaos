import {
	ClipboardDocumentIcon,
	GiftIcon,
	PlusIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth";
import { Badge, Button, Input } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { useFormatDateTime } from "../../hooks/useFormatDateTime";
import { TOKENS } from "../../utils/colors";
import { formatUSD } from "../../utils/format";
import { toastApiError } from "../../utils/toast-error";

interface GiftCard {
	code: string;
	amount: number;
	redeemed_by: string | null;
	redeemed_at: number | null;
	created_by: string;
	batch_id: string | null;
	created_at: number;
}

export function GiftCards() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const formatDateTime = useFormatDateTime();

	const [amount, setAmount] = useState("5");
	const [count, setCount] = useState("10");
	const [generating, setGenerating] = useState(false);
	const [lastBatch, setLastBatch] = useState<{
		batchId: string;
		codes: string[];
		amount: number;
	} | null>(null);

	const {
		data: allCards,
		loading,
		refetch,
	} = useFetch<{ rows: GiftCard[]; total: number }>(
		"/api/admin/gift-cards?limit=500",
		{ staleTime: 5_000 },
	);

	const cards = allCards?.rows ?? [];

	const stats = {
		total: cards.length,
		redeemed: cards.filter((c) => c.redeemed_by).length,
		available: cards.filter((c) => !c.redeemed_by).length,
		totalValue: cards.reduce((sum, c) => sum + c.amount, 0),
		redeemedValue: cards
			.filter((c) => c.redeemed_by)
			.reduce((sum, c) => sum + c.amount, 0),
	};

	const handleGenerate = useCallback(async () => {
		const amt = Number.parseFloat(amount);
		const cnt = Number.parseInt(count, 10);
		if (!amt || amt <= 0 || !cnt || cnt < 1 || cnt > 500) {
			toast.error(t("errors.admin_gift_card_invalid"));
			return;
		}
		setGenerating(true);
		try {
			const token = await getToken();
			const res = await fetch("/api/admin/gift-cards", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ amount: amt, count: cnt }),
			});
			const json = await res.json();
			if (json.batchId) {
				setLastBatch({ batchId: json.batchId, codes: json.codes, amount: amt });
				toast.success(
					t("admin.gift_cards_generated", {
						count: json.codes.length,
						amount: formatUSD(amt),
					}),
				);
				refetch();
			} else {
				toastApiError(json, t);
			}
		} catch {
			toast.error(t("common.network_error"));
		} finally {
			setGenerating(false);
		}
	}, [amount, count, getToken, refetch, t]);

	const copyAll = useCallback(() => {
		if (!lastBatch) return;
		navigator.clipboard.writeText(lastBatch.codes.join("\n"));
		toast.success(
			t("admin.gift_cards_copied", { count: lastBatch.codes.length }),
		);
	}, [lastBatch, t]);

	const copySingle = useCallback(
		(code: string) => {
			navigator.clipboard.writeText(code);
			toast.success(t("common.copied"));
		},
		[t],
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-xl font-semibold text-gray-900 dark:text-white">
					{t("admin.gift_cards_title")}
				</h1>
				<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
					{t("admin.gift_cards_subtitle")}
				</p>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
				{[
					{
						label: t("admin.gift_cards_total"),
						value: stats.total,
						sub: formatUSD(stats.totalValue),
					},
					{
						label: t("admin.gift_cards_redeemed"),
						value: stats.redeemed,
						color: TOKENS.blue.text,
					},
					{
						label: t("admin.gift_cards_unredeemed"),
						value: stats.available,
						color: TOKENS.green.text,
					},
					{
						label: t("admin.gift_cards_redeemed_value"),
						value: formatUSD(stats.redeemedValue),
						color: TOKENS.blue.text,
					},
					{
						label: t("admin.gift_cards_unredeemed_value"),
						value: formatUSD(stats.totalValue - stats.redeemedValue),
						color: TOKENS.green.text,
					},
				].map((s) => (
					<div
						key={s.label}
						className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/5"
					>
						<p className="text-xs font-medium text-gray-500 dark:text-gray-400">
							{s.label}
						</p>
						<p
							className={`mt-1 text-xl font-semibold ${s.color ?? "text-gray-900 dark:text-white"}`}
						>
							{s.value}
						</p>
						{s.sub && (
							<p className="text-xs text-gray-400 dark:text-gray-500">
								{s.sub}
							</p>
						)}
					</div>
				))}
			</div>

			{/* Generate */}
			<div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-white/5">
				<div className="flex items-center gap-3">
					<div className="rounded-lg bg-brand-500/10 p-2.5 dark:bg-brand-500/15">
						<PlusIcon className="size-5 text-brand-500" />
					</div>
					<div>
						<h3 className="text-sm font-semibold text-gray-900 dark:text-white">
							{t("admin.gift_cards_generate")}
						</h3>
						<p className="text-xs text-gray-500 dark:text-gray-400">
							{t("admin.gift_cards_generate_desc")}
						</p>
					</div>
				</div>
				<div className="mt-4 flex flex-wrap items-end gap-4">
					<div className="w-36">
						<label
							htmlFor="gc-amount"
							className="text-xs font-medium text-gray-500 dark:text-gray-400"
						>
							{t("admin.gift_cards_amount_label")}
						</label>
						<div className="relative mt-1">
							<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
								$
							</span>
							<Input
								id="gc-amount"
								type="number"
								min="0.01"
								step="0.01"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								className="pl-7"
							/>
						</div>
					</div>
					<div className="w-28">
						<label
							htmlFor="gc-count"
							className="text-xs font-medium text-gray-500 dark:text-gray-400"
						>
							{t("admin.gift_cards_count_label")}
						</label>
						<Input
							id="gc-count"
							type="number"
							min="1"
							max="500"
							value={count}
							onChange={(e) => setCount(e.target.value)}
							className="mt-1"
						/>
					</div>
					<Button disabled={generating} onClick={handleGenerate}>
						<GiftIcon className="-ml-0.5 size-5" />
						{t("admin.gift_cards_generate_btn")}
					</Button>
				</div>

				{/* Last batch result */}
				{lastBatch && (
					<div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-500/20 dark:bg-brand-500/5">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-sm font-medium text-gray-900 dark:text-white">
								{t("admin.gift_cards_batch_result", {
									count: lastBatch.codes.length,
									amount: formatUSD(lastBatch.amount),
									batchId: lastBatch.batchId,
								})}
							</p>
							<Button
								variant="secondary"
								size="sm"
								onClick={copyAll}
								className="w-full sm:w-auto"
							>
								<ClipboardDocumentIcon className="size-4" />
								{t("admin.gift_cards_copy_all")}
							</Button>
						</div>
						<div className="mt-3 max-h-40 overflow-y-auto">
							<div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
								{lastBatch.codes.map((code) => (
									<button
										key={code}
										type="button"
										onClick={() => copySingle(code)}
										className="rounded-md bg-white px-3 py-1.5 text-left font-mono text-xs text-gray-700 transition-colors hover:bg-brand-50 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
									>
										{code}
									</button>
								))}
							</div>
						</div>
					</div>
				)}
			</div>

			{/* All Cards Table */}
			<div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
				<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
					<thead>
						<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
							<th className="py-2.5 pl-4 pr-2 sm:pl-5">
								{t("admin.gift_cards_code")}
							</th>
							<th className="px-2 py-2.5 text-right">{t("credits.amount")}</th>
							<th className="px-2 py-2.5">{t("credits.status")}</th>
							<th className="px-2 py-2.5">
								{t("admin.gift_cards_redeemed_by")}
							</th>
							<th className="px-2 py-2.5">{t("admin.gift_cards_batch")}</th>
							<th className="py-2.5 pl-2 pr-4 sm:pr-5">{t("credits.time")}</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
						{loading && !cards.length ? (
							<tr>
								<td
									colSpan={6}
									className="py-12 text-center text-sm text-gray-400"
								>
									<div className="animate-pulse">Loading...</div>
								</td>
							</tr>
						) : cards.length === 0 ? (
							<tr>
								<td
									colSpan={6}
									className="py-12 text-center text-sm text-gray-400 dark:text-gray-500"
								>
									{t("admin.gift_cards_empty")}
								</td>
							</tr>
						) : (
							cards.map((card) => (
								<tr
									key={card.code}
									className="even:bg-gray-50/50 dark:even:bg-white/[0.015]"
								>
									<td className="py-2.5 pl-4 pr-2 sm:pl-5">
										<button
											type="button"
											onClick={() => copySingle(card.code)}
											className="font-mono text-sm text-gray-700 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400 transition-colors"
										>
											{card.code}
										</button>
									</td>
									<td className="px-2 py-2.5 text-sm text-right text-gray-600 dark:text-gray-400">
										{formatUSD(card.amount)}
									</td>
									<td className="px-2 py-2.5">
										{card.redeemed_by ? (
											<Badge variant="default">
												{t("admin.gift_cards_used")}
											</Badge>
										) : (
											<Badge variant="success">
												{t("admin.gift_cards_active")}
											</Badge>
										)}
									</td>
									<td className="px-2 py-2.5 text-sm text-gray-500 dark:text-gray-400">
										{card.redeemed_by ? (
											<span className="font-mono text-xs">
												{card.redeemed_by.slice(0, 16)}…
											</span>
										) : (
											"—"
										)}
									</td>
									<td className="px-2 py-2.5">
										{card.batch_id ? (
											<span className="font-mono text-xs text-gray-400 dark:text-gray-500">
												{card.batch_id}
											</span>
										) : (
											"—"
										)}
									</td>
									<td className="py-2.5 pl-2 pr-4 text-sm text-gray-500 dark:text-gray-400 sm:pr-5 whitespace-nowrap">
										{card.redeemed_at
											? formatDateTime(card.redeemed_at)
											: formatDateTime(card.created_at)}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

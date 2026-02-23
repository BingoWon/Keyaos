import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";

interface LedgerEntry {
	id: string;
	direction: "spent" | "earned" | "self";
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	baseCost: number;
	netCredits: number;
	createdAt: number;
}

function DirectionBadge({
	direction,
}: {
	direction: LedgerEntry["direction"];
}) {
	const { t } = useTranslation();

	if (direction === "earned") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
				<ArrowDownTrayIcon className="size-3" />
				{t("ledger.earned")}
			</span>
		);
	}
	if (direction === "spent") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
				<ArrowUpTrayIcon className="size-3" />
				{t("ledger.spent")}
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
			<ArrowPathIcon className="size-3" />
			{t("ledger.self_use")}
		</span>
	);
}

function formatCredits(value: number): string {
	if (value === 0) return "$0.00";
	if (Math.abs(value) < 0.0001) return value > 0 ? "+<$0.0001" : "-<$0.0001";
	const sign = value > 0 ? "+" : "";
	return `${sign}$${value.toFixed(4)}`;
}

export function Ledger() {
	const { t } = useTranslation();
	const formatDateTime = useFormatDateTime();
	const {
		data: entries,
		loading,
		error,
	} = useFetch<LedgerEntry[]>("/api/ledger?limit=100");

	if (error) {
		return (
			<div className="p-4 text-sm text-red-500 bg-red-50 rounded-lg dark:bg-red-900/20 dark:text-red-400">
				Failed to load ledger: {error.message}
			</div>
		);
	}

	return (
		<div>
			<h3 className="text-base font-semibold text-gray-900 dark:text-white">
				{t("ledger.title")}
			</h3>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				{t("ledger.subtitle")}
			</p>

			{loading ? (
				<div className="mt-5">
					<PageLoader />
				</div>
			) : !entries?.length ? (
				<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{t("ledger.no_data")}
				</p>
			) : (
				<div className="mt-5 overflow-hidden shadow ring-1 ring-black/5 rounded-lg dark:ring-white/10">
					<table className="min-w-full divide-y divide-gray-300 dark:divide-white/10">
						<thead className="bg-gray-50 dark:bg-white/5">
							<tr>
								<th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">
									{t("ledger.time")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("ledger.direction")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("ledger.model")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("ledger.provider")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
									{t("ledger.tokens")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
									{t("ledger.base_cost")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white sm:pr-6">
									{t("ledger.net_credits")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-200 dark:divide-white/5 bg-white dark:bg-transparent">
							{entries.map((tx) => (
								<tr key={tx.id}>
									<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-500 dark:text-gray-400 sm:pl-6">
										{formatDateTime(tx.createdAt)}
									</td>
									<td className="whitespace-nowrap px-3 py-4">
										<DirectionBadge direction={tx.direction} />
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900 dark:text-white">
										{tx.model}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
										{tx.provider}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-500 dark:text-gray-400">
										{(tx.inputTokens + tx.outputTokens).toLocaleString()}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-500 dark:text-gray-400">
										{tx.baseCost > 0 ? `$${tx.baseCost.toFixed(4)}` : "—"}
									</td>
									<td
										className={`whitespace-nowrap px-3 py-4 text-sm text-right font-medium sm:pr-6 ${
											tx.netCredits > 0
												? "text-green-600 dark:text-green-400"
												: tx.netCredits < 0
													? "text-red-600 dark:text-red-400"
													: "text-gray-400 dark:text-gray-500"
										}`}
									>
										{formatCredits(tx.netCredits)}
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

import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	BanknotesIcon,
	CreditCardIcon,
	WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import { formatSignedUSD } from "../utils/format";

interface LedgerEntry {
	id: string;
	type: "usage" | "top_up" | "adjustment";
	category: string;
	description: string;
	amount: number;
	created_at: number;
}

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
		labelKey: "ledger.api_spend",
	},
	credential_earn: {
		icon: ArrowDownTrayIcon,
		colorClass: "text-green-700 dark:text-green-400",
		bgClass: "bg-green-50 dark:bg-green-900/30",
		labelKey: "ledger.credential_earn",
	},
	top_up: {
		icon: CreditCardIcon,
		colorClass: "text-blue-700 dark:text-blue-400",
		bgClass: "bg-blue-50 dark:bg-blue-900/30",
		labelKey: "ledger.top_up",
	},
	grant: {
		icon: BanknotesIcon,
		colorClass: "text-emerald-700 dark:text-emerald-400",
		bgClass: "bg-emerald-50 dark:bg-emerald-900/30",
		labelKey: "ledger.grant",
	},
	revoke: {
		icon: WrenchScrewdriverIcon,
		colorClass: "text-orange-700 dark:text-orange-400",
		bgClass: "bg-orange-50 dark:bg-orange-900/30",
		labelKey: "ledger.revoke",
	},
};

function CategoryBadge({ category }: { category: string }) {
	const { t } = useTranslation();
	const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.api_spend;
	const Icon = config.icon;

	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bgClass} ${config.colorClass}`}
		>
			<Icon className="size-3" />
			{t(config.labelKey)}
		</span>
	);
}


export function Ledger() {
	const { t } = useTranslation();
	const formatDateTime = useFormatDateTime();
	const {
		data: entries,
		loading,
		error,
	} = useFetch<LedgerEntry[]>("/api/ledger?limit=200");

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
									{t("ledger.type")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("ledger.description")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white sm:pr-6">
									{t("ledger.amount")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-200 dark:divide-white/5 bg-white dark:bg-transparent">
							{entries.map((entry) => (
								<tr key={`${entry.type}-${entry.id}`}>
									<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-500 dark:text-gray-400 sm:pl-6">
										{formatDateTime(entry.created_at)}
									</td>
									<td className="whitespace-nowrap px-3 py-4">
										<CategoryBadge category={entry.category} />
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 dark:text-white">
										{entry.description ||
											(entry.type === "adjustment"
												? t("ledger.admin_adjustment")
												: "—")}
									</td>
									<td
										className={`whitespace-nowrap px-3 py-4 text-sm text-right font-medium sm:pr-6 ${
											entry.amount > 0
												? "text-green-600 dark:text-green-400"
												: entry.amount < 0
													? "text-red-600 dark:text-red-400"
													: "text-gray-400 dark:text-gray-500"
										}`}
									>
										{formatSignedUSD(entry.amount)}
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

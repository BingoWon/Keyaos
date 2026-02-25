import {
	CreditCardIcon,
	CurrencyDollarIcon,
	DocumentCheckIcon,
	KeyIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { isPlatform } from "../auth";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";
import { formatUSD } from "../utils/format";

interface Stats {
	total: number;
	activeProviders: number;
	dead: number;
	totalQuota: number;
}

export function Dashboard() {
	const { t } = useTranslation();
	const { data: stats, loading, error } = useFetch<Stats>("/api/pool/stats");
	const { data: wallet } = useFetch<{ balance: number }>(
		"/api/billing/balance",
		{ skip: !isPlatform },
	);

	if (error) {
		return (
			<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-900/20 dark:text-red-400">
				Failed to load stats: {error.message}
			</div>
		);
	}

	const cards = [
		{
			name: t("dashboard.total_credentials"),
			stat: stats?.total ?? "-",
			icon: KeyIcon,
		},
		{
			name: t("dashboard.active_credentials"),
			stat: stats ? stats.total - stats.dead : "-",
			icon: DocumentCheckIcon,
		},
		{
			name: t("dashboard.total_quota"),
			stat: stats ? formatUSD(stats.totalQuota) : "-",
			icon: CurrencyDollarIcon,
		},
		...(isPlatform
			? [
					{
						name: t("dashboard.wallet_balance"),
						stat: wallet ? formatUSD(wallet.balance) : "-",
						icon: CreditCardIcon,
					},
				]
			: []),
	];

	return (
		<div>
			<h3 className="text-base font-semibold text-gray-900 dark:text-white">
				{t("dashboard.title")}
			</h3>

			{loading ? (
				<div className="mt-5">
					<PageLoader />
				</div>
			) : (
				<dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{cards.map((item) => (
						<div
							key={item.name}
							className="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-white/5"
						>
							<dt className="flex items-center gap-3">
								<div className="rounded-lg bg-brand-500/10 p-2.5 dark:bg-brand-500/15">
									<item.icon
										aria-hidden="true"
										className="size-5 text-brand-500"
									/>
								</div>
								<p className="truncate text-sm font-medium text-gray-500 dark:text-gray-400">
									{item.name}
								</p>
							</dt>
							<dd className="mt-3 ml-[3.25rem]">
								<p className="text-2xl font-semibold text-gray-900 dark:text-white">
									{item.stat}
								</p>
							</dd>
						</div>
					))}
				</dl>
			)}
		</div>
	);
}

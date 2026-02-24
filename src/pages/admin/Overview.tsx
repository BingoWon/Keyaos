import {
	ArrowPathIcon,
	BanknotesIcon,
	ChartBarIcon,
	CreditCardIcon,
	ServerStackIcon,
	TableCellsIcon,
	UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { PageLoader } from "../../components/PageLoader";
import { useFetch } from "../../hooks/useFetch";
import { formatUSD } from "../../utils/format";

interface PlatformOverview {
	totalRevenue: number;
	totalConsumption: number;
	totalServiceFees: number;
	totalRequests: number;
	activeCredentials: number;
	registeredUsers: number;
}

export function Overview() {
	const { t } = useTranslation();
	const { data, loading, refetch } = useFetch<PlatformOverview>(
		"/api/admin/overview",
	);

	const cards = data
		? [
				{
					name: t("admin.total_revenue"),
					value: formatUSD(data.totalRevenue),
					icon: BanknotesIcon,
				},
				{
					name: t("admin.total_consumption"),
					value: formatUSD(data.totalConsumption),
					icon: CreditCardIcon,
				},
				{
					name: t("admin.service_fees"),
					value: formatUSD(data.totalServiceFees),
					icon: ChartBarIcon,
				},
				{
					name: t("admin.total_requests"),
					value: data.totalRequests.toLocaleString(),
					icon: TableCellsIcon,
				},
				{
					name: t("admin.active_credentials"),
					value: data.activeCredentials.toString(),
					icon: ServerStackIcon,
				},
				{
					name: t("admin.registered_users"),
					value: data.registeredUsers.toString(),
					icon: UserGroupIcon,
				},
			]
		: [];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-base font-semibold text-gray-900 dark:text-white">
						{t("admin.overview")}
					</h3>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("admin.subtitle")}
					</p>
				</div>
				<button
					type="button"
					onClick={refetch}
					className="rounded p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
				>
					<ArrowPathIcon className="size-5" />
				</button>
			</div>

			{loading ? (
				<PageLoader />
			) : (
				<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
					{cards.map((c) => (
						<div
							key={c.name}
							className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow dark:bg-white/5"
						>
							<dt className="flex items-center gap-2 truncate text-sm font-medium text-gray-500 dark:text-gray-400">
								<c.icon className="size-4 shrink-0" />
								{c.name}
							</dt>
							<dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
								{c.value}
							</dd>
						</div>
					))}
				</dl>
			)}
		</div>
	);
}

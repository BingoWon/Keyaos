import {
	CurrencyDollarIcon,
	DocumentCheckIcon,
	KeyIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageLoader } from "../components/PageLoader";

interface Stats {
	totalKeys: number;
	activeProviders: number;
	deadKeys: number;
}

export function Dashboard() {
	const { t } = useTranslation();
	const [stats, setStats] = useState<Stats | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetch("/pool/stats")
			.then((res) => res.json())
			.then((data) => {
				setStats(data);
				setLoading(false);
			})
			.catch((err) => {
				console.error("Failed to fetch stats", err);
				setLoading(false);
			});
	}, []);

	const cards = [
		{
			name: t("dashboard.total_keys"),
			stat: stats?.totalKeys ?? "-",
			icon: KeyIcon,
		},
		{
			name: t("dashboard.active_keys"),
			stat: (stats?.totalKeys ?? 0) - (stats?.deadKeys ?? 0),
			icon: DocumentCheckIcon,
		},
		{
			name: t("dashboard.total_balance"),
			stat: "---",
			icon: CurrencyDollarIcon,
		},
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
				<dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{cards.map((item) => (
						<div
							key={item.name}
							className="relative overflow-hidden rounded-lg bg-white px-4 pt-5 pb-12 shadow sm:px-6 sm:pt-6 dark:bg-white/5"
						>
							<dt>
								<div className="absolute rounded-md bg-indigo-500 p-3">
									<item.icon aria-hidden="true" className="size-6 text-white" />
								</div>
								<p className="ml-16 truncate text-sm font-medium text-gray-500 dark:text-gray-400">
									{item.name}
								</p>
							</dt>
							<dd className="ml-16 flex items-baseline pb-6 sm:pb-7">
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

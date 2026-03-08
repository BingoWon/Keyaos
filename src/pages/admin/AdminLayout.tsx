import {
	ArrowLeftIcon,
	ChartBarIcon,
	GiftIcon,
	TableCellsIcon,
	UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Navigate, NavLink } from "react-router-dom";
import { useAuth } from "../../auth";
import { BaseSidebarLayout } from "../../components/BaseSidebarLayout";
import { classNames } from "../../utils/classNames";

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
	const { t } = useTranslation();

	const items = [
		{
			name: t("admin.overview"),
			href: "/admin",
			icon: ChartBarIcon,
			end: true,
		},
		{ name: t("admin.users"), href: "/admin/users", icon: UserGroupIcon },
		{
			name: t("admin.gift_cards_title"),
			href: "/admin/gift-cards",
			icon: GiftIcon,
		},
		{
			name: t("admin.data_explorer"),
			href: "/admin/data",
			icon: TableCellsIcon,
		},
	];

	return (
		<nav className="flex flex-1 flex-col">
			<div className="-mx-2 space-y-1">
				{items.map((item) => (
					<NavLink
						key={item.href}
						to={item.href}
						end={"end" in item ? item.end : undefined}
						onClick={onNavigate}
						className={({ isActive }) =>
							classNames(
								isActive
									? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
									: "text-gray-700 hover:bg-gray-50 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white",
								"group flex gap-x-3 rounded-lg p-2 text-sm/6 font-semibold",
							)
						}
					>
						{({ isActive }) => (
							<>
								<item.icon
									aria-hidden="true"
									className={classNames(
										isActive
											? "text-brand-600 dark:text-brand-300"
											: "text-gray-400 group-hover:text-brand-600 dark:group-hover:text-white",
										"size-6 shrink-0",
									)}
								/>
								{item.name}
							</>
						)}
					</NavLink>
				))}
			</div>
			<div className="-mx-2 mt-4">
				<div className="mx-3 mb-2 h-px bg-gray-950/5 dark:bg-white/5" />
				<NavLink
					to="/dashboard"
					end
					onClick={onNavigate}
					className="group flex gap-x-3 rounded-lg p-2 text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
				>
					<ArrowLeftIcon className="size-6 shrink-0 text-gray-400 group-hover:text-brand-600 dark:group-hover:text-white" />
					{t("nav.dashboard")}
				</NavLink>
			</div>
		</nav>
	);
}

export function AdminLayout() {
	const { isAdmin, isLoaded } = useAuth();

	if (!isLoaded || isAdmin === null) return null;
	if (!isAdmin) return <Navigate to="/dashboard" replace />;

	return (
		<BaseSidebarLayout
			navigation={(onClose) => <AdminNav onNavigate={onClose} />}
		/>
	);
}

import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import {
	ChartBarIcon,
	TableCellsIcon,
	UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { BaseSidebarLayout } from "../../components/BaseSidebarLayout";
import { LanguageSelector } from "../../components/LanguageSelector";
import { ThemeToggle } from "../../components/ThemeToggle";
import { classNames } from "../../utils/classNames";

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
	const { t } = useTranslation();

	const items = [
		{ name: t("admin.overview"), href: "/admin", icon: ChartBarIcon, end: true },
		{ name: t("admin.users"), href: "/admin/users", icon: UserGroupIcon },
		{ name: t("admin.data_explorer"), href: "/admin/data", icon: TableCellsIcon },
	];

	return (
		<nav className="flex flex-1 flex-col">
			<ul className="flex flex-1 flex-col gap-y-7">
				<li>
					<ul className="-mx-2 space-y-1">
						{items.map((item) => (
							<li key={item.href}>
								<NavLink
									to={item.href}
									end={"end" in item ? item.end : undefined}
									onClick={onNavigate}
									className={({ isActive }) =>
										classNames(
											isActive
												? "bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white"
												: "text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white",
											"group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold",
										)
									}
								>
									{({ isActive }) => (
										<>
											<item.icon
												aria-hidden="true"
												className={classNames(
													isActive
														? "text-indigo-600 dark:text-white"
														: "text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white",
													"size-6 shrink-0",
												)}
											/>
											{item.name}
										</>
									)}
								</NavLink>
							</li>
						))}
					</ul>
				</li>
				<li className="-mx-2">
					<NavLink
						to="/dashboard"
						end
						onClick={onNavigate}
						className="group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
					>
						<ArrowLeftIcon className="size-6 shrink-0 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white" />
						{t("nav.dashboard")}
					</NavLink>
				</li>
				<li className="-mx-6 mt-auto">
					<div className="flex items-center justify-around py-4 border-t border-gray-200 dark:border-white/10">
						<ThemeToggle />
						<LanguageSelector />
					</div>
				</li>
			</ul>
		</nav>
	);
}

export function AdminLayout() {
	const { isAdmin, isLoaded } = useAuth();
	const { t } = useTranslation();

	if (!isLoaded || isAdmin === null) return null;
	if (!isAdmin) return <Navigate to="/dashboard" replace />;

	return (
		<BaseSidebarLayout
			navigation={(onClose) => <AdminNav onNavigate={onClose} />}
			mobileTitle={t("admin.title")}
		/>
	);
}

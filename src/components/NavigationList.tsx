import {
	BookOpenIcon,
	BuildingOfficeIcon,
	CpuChipIcon,
	CreditCardIcon,
	HomeIcon,
	KeyIcon,
	ListBulletIcon,
	ServerStackIcon,
	ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { isPlatform, useAuth } from "../auth";
import { classNames } from "../utils/classNames";
import { LanguageSelector } from "./LanguageSelector";
import { ThemeToggle } from "./ThemeToggle";

interface NavigationListProps {
	onNavigate?: () => void;
}

export function NavigationList({ onNavigate }: NavigationListProps) {
	const { t } = useTranslation();
	const { isAdmin } = useAuth();

	const navigation = [
		{ name: t("nav.dashboard"), href: "/dashboard", icon: HomeIcon, end: true },
		{ name: t("nav.models"), href: "/dashboard/models", icon: CpuChipIcon },
		{
			name: t("nav.providers"),
			href: "/dashboard/providers",
			icon: BuildingOfficeIcon,
		},
		{
			name: t("nav.byok"),
			href: "/dashboard/byok",
			icon: ServerStackIcon,
		},
		{ name: t("nav.api_keys"), href: "/dashboard/api-keys", icon: KeyIcon },
		{
			name: t("nav.usage"),
			href: "/dashboard/usage",
			icon: ListBulletIcon,
		},
		...(isPlatform
			? [
				{
					name: t("nav.ledger"),
					href: "/dashboard/ledger",
					icon: BookOpenIcon,
				},
				{
					name: t("nav.billing"),
					href: "/dashboard/billing",
					icon: CreditCardIcon,
				},
			]
			: []),
		...(isAdmin === true
			? [
				{
					name: t("nav.admin"),
					href: "/admin",
					icon: ShieldCheckIcon,
				},
			]
			: []),
	];

	return (
		<nav className="flex flex-1 flex-col">
			<ul className="flex flex-1 flex-col gap-y-7">
				<li>
					<ul className="-mx-2 space-y-1">
						{navigation.map((item) => (
							<li key={item.name}>
								<NavLink
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
							</li>
						))}
					</ul>
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

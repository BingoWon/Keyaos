import {
	CreditCardIcon,
	HomeIcon,
	KeyIcon,
	ListBulletIcon,
	ServerStackIcon,
	ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import {
	CreditCardIcon as CreditCardIconSolid,
	HomeIcon as HomeIconSolid,
	KeyIcon as KeyIconSolid,
	ListBulletIcon as ListBulletIconSolid,
	ServerStackIcon as ServerStackIconSolid,
	ShieldCheckIcon as ShieldCheckIconSolid,
} from "@heroicons/react/24/solid";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { isPlatform, useAuth } from "../auth";
import { classNames } from "../utils/classNames";

interface NavItem {
	name: string;
	href: string;
	icon: typeof HomeIcon;
	activeIcon: typeof HomeIconSolid;
	end?: boolean;
}

interface NavigationListProps {
	onNavigate?: () => void;
}

export function NavigationList({ onNavigate }: NavigationListProps) {
	const { t } = useTranslation();
	const { isAdmin } = useAuth();

	const groups: NavItem[][] = [
		[
			{
				name: t("nav.overview"),
				href: "/dashboard",
				icon: HomeIcon,
				activeIcon: HomeIconSolid,
				end: true,
			},
		],
		[
			{
				name: t("nav.byok"),
				href: "/dashboard/byok",
				icon: ServerStackIcon,
				activeIcon: ServerStackIconSolid,
			},
			{
				name: t("nav.api_keys"),
				href: "/dashboard/api-keys",
				icon: KeyIcon,
				activeIcon: KeyIconSolid,
			},
		],
		[
			{
				name: t("nav.logs"),
				href: "/dashboard/logs",
				icon: ListBulletIcon,
				activeIcon: ListBulletIconSolid,
			},
			...(isPlatform
				? [
						{
							name: t("nav.credits"),
							href: "/dashboard/credits",
							icon: CreditCardIcon,
							activeIcon: CreditCardIconSolid,
						},
					]
				: []),
		],
		...(isAdmin === true
			? [
					[
						{
							name: t("nav.admin"),
							href: "/admin",
							icon: ShieldCheckIcon,
							activeIcon: ShieldCheckIconSolid,
						},
					],
				]
			: []),
	];

	return (
		<nav className="flex flex-1 flex-col">
			<div className="-mx-2">
				{groups.map((group, gi) => (
					<Fragment key={group[0]?.href ?? gi}>
						{gi > 0 && (
							<div className="mx-3 my-2 h-px bg-gray-950/5 dark:bg-white/5" />
						)}
						<ul className="space-y-1">
							{group.map((item) => (
								<li key={item.href}>
									<NavLink
										to={item.href}
										end={item.end}
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
										{({ isActive }) => {
											const Icon = isActive ? item.activeIcon : item.icon;
											return (
												<>
													<Icon
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
											);
										}}
									</NavLink>
								</li>
							))}
						</ul>
					</Fragment>
				))}
			</div>
		</nav>
	);
}

import { Cog6ToothIcon, HomeIcon, KeyIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { LanguageSelector } from "./LanguageSelector";
import { ThemeToggle } from "./ThemeToggle";

function classNames(...classes: string[]) {
	return classes.filter(Boolean).join(" ");
}

interface NavigationListProps {
	onNavigate?: () => void;
}

export function NavigationList({ onNavigate }: NavigationListProps) {
	const location = useLocation();
	const { t } = useTranslation();

	const navigation = [
		{ name: t("nav.dashboard"), href: "/", icon: HomeIcon },
		{ name: t("nav.keys"), href: "/keys", icon: KeyIcon },
		{ name: t("nav.settings"), href: "/settings", icon: Cog6ToothIcon },
	];

	return (
		<nav className="flex flex-1 flex-col">
			<ul className="flex flex-1 flex-col gap-y-7">
				<li>
					<ul className="-mx-2 space-y-1">
						{navigation.map((item) => {
							const current = location.pathname === item.href;
							return (
								<li key={item.name}>
									<Link
										to={item.href}
										onClick={onNavigate}
										className={classNames(
											current
												? "bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white"
												: "text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white",
											"group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold",
										)}
									>
										<item.icon
											aria-hidden="true"
											className={classNames(
												current
													? "text-indigo-600 dark:text-white"
													: "text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white",
												"size-6 shrink-0",
											)}
										/>
										{item.name}
									</Link>
								</li>
							);
						})}
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

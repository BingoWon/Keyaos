import {
	Dialog,
	DialogBackdrop,
	DialogPanel,
	TransitionChild,
} from "@headlessui/react";
import {
	Bars3Icon,
	BookOpenIcon,
	CurrencyDollarIcon,
	ShieldCheckIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import {
	BookOpenIcon as BookOpenIconSolid,
	CurrencyDollarIcon as CurrencyDollarIconSolid,
	ShieldCheckIcon as ShieldCheckIconSolid,
} from "@heroicons/react/24/solid";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet } from "react-router-dom";
import { LanguageSelector } from "../../components/LanguageSelector";
import { ThemeToggle } from "../../components/ThemeToggle";
import { classNames } from "../../utils/classNames";
import { mdxComponents } from "./MdxComponents";

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

const GITHUB_URL = "https://github.com/BingoWon/Keyaos";

function GitHubIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			className={className}
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
		</svg>
	);
}

interface NavItem {
	name: string;
	href: string;
	icon: HeroIcon;
	activeIcon: HeroIcon;
}

function Sidebar({
	items,
	onNavigate,
}: {
	items: NavItem[];
	onNavigate?: () => void;
}) {
	return (
		<nav className="flex flex-1 flex-col">
			<ul className="flex flex-1 flex-col gap-y-1">
				{items.map((item) => (
					<li key={item.href}>
						<NavLink
							to={item.href}
							end
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
			<div className="flex items-center justify-around border-t border-gray-200 py-4 dark:border-white/10">
				<ThemeToggle />
				<LanguageSelector />
			</div>
		</nav>
	);
}

export function DocsLayout() {
	const { t } = useTranslation();
	const [sidebarOpen, setSidebarOpen] = useState(false);

	const navItems: NavItem[] = [
		{
			name: t("docs.nav_quickstart"),
			href: "/docs/quickstart",
			icon: BookOpenIcon,
			activeIcon: BookOpenIconSolid,
		},
		{
			name: t("docs.nav_pricing"),
			href: "/docs/pricing",
			icon: CurrencyDollarIcon,
			activeIcon: CurrencyDollarIconSolid,
		},
		{
			name: t("docs.nav_privacy"),
			href: "/docs/privacy",
			icon: ShieldCheckIcon,
			activeIcon: ShieldCheckIconSolid,
		},
	];

	return (
		<div>
			{/* Mobile sidebar dialog */}
			<Dialog
				open={sidebarOpen}
				onClose={setSidebarOpen}
				className="relative z-50 lg:hidden"
			>
				<DialogBackdrop
					transition
					className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
				/>
				<div className="fixed inset-0 flex">
					<DialogPanel
						transition
						className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
					>
						<TransitionChild>
							<div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
								<button
									type="button"
									onClick={() => setSidebarOpen(false)}
									className="-m-2.5 p-2.5"
								>
									<span className="sr-only">Close sidebar</span>
									<XMarkIcon aria-hidden="true" className="size-6 text-white" />
								</button>
							</div>
						</TransitionChild>
						<div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-2 dark:bg-gray-900 dark:ring dark:ring-white/10">
							<div className="flex h-16 shrink-0 items-center">
								<Link to="/" className="flex items-center gap-2.5">
									<img src="/logo.png" alt="Keyaos" className="size-7" />
									<span className="text-lg font-bold text-gray-900 dark:text-white">
										{t("brand.name")}
									</span>
								</Link>
							</div>
							<Sidebar
								items={navItems}
								onNavigate={() => setSidebarOpen(false)}
							/>
						</div>
					</DialogPanel>
				</div>
			</Dialog>

			{/* Desktop sidebar */}
			<div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
				<div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 dark:border-white/10 dark:bg-black/10">
					<div className="flex h-16 shrink-0 items-center justify-between">
						<Link to="/" className="flex items-center gap-2.5">
							<img src="/logo.png" alt="Keyaos" className="size-7" />
							<span className="text-lg font-bold text-gray-900 dark:text-white">
								{t("brand.name")}
							</span>
						</Link>
						<a
							href={GITHUB_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
							aria-label="GitHub"
						>
							<GitHubIcon className="size-5" />
						</a>
					</div>
					<Sidebar items={navItems} />
				</div>
			</div>

			{/* Mobile top bar */}
			<div className="sticky top-0 z-40 flex items-center gap-x-6 bg-white px-4 py-4 shadow-xs sm:px-6 lg:hidden dark:bg-gray-900 dark:shadow-none dark:border-b dark:border-white/10">
				<button
					type="button"
					onClick={() => setSidebarOpen(true)}
					className="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900 lg:hidden dark:text-gray-400 dark:hover:text-white"
				>
					<span className="sr-only">Open sidebar</span>
					<Bars3Icon aria-hidden="true" className="size-6" />
				</button>
				<div className="flex-1 text-sm/6 font-semibold text-gray-900 dark:text-white">
					{t("docs.title")}
				</div>
			</div>

			{/* Content area */}
			<main className="py-10 lg:pl-72 dark:bg-gray-900 min-h-screen">
				<div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
					<Outlet context={mdxComponents} />
				</div>
			</main>
		</div>
	);
}

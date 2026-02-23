import {
	Dialog,
	DialogBackdrop,
	DialogPanel,
	TransitionChild,
} from "@headlessui/react";
import {
	ArrowLeftIcon,
	Bars3Icon,
	ChartBarIcon,
	TableCellsIcon,
	UserGroupIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth";
import { LanguageSelector } from "../../components/LanguageSelector";
import { Logo } from "../../components/Logo";
import { ThemeToggle } from "../../components/ThemeToggle";

function classNames(...classes: string[]) {
	return classes.filter(Boolean).join(" ");
}

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
	const { t } = useTranslation();
	const location = useLocation();

	const items = [
		{
			name: t("admin.overview"),
			href: "/admin",
			icon: ChartBarIcon,
			exact: true,
		},
		{
			name: t("admin.users"),
			href: "/admin/users",
			icon: UserGroupIcon,
			exact: false,
		},
		{
			name: t("admin.data_explorer"),
			href: "/admin/data",
			icon: TableCellsIcon,
			exact: false,
		},
	];

	return (
		<nav className="flex flex-1 flex-col">
			<ul className="flex flex-1 flex-col gap-y-7">
				<li>
					<ul className="-mx-2 space-y-1">
						{items.map((item) => {
							const current = item.exact
								? location.pathname === item.href
								: location.pathname.startsWith(item.href);
							return (
								<li key={item.href}>
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
				<li className="-mx-2">
					<Link
						to="/dashboard"
						onClick={onNavigate}
						className="group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
					>
						<ArrowLeftIcon className="size-6 shrink-0 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white" />
						{t("nav.dashboard")}
					</Link>
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
	const [sidebarOpen, setSidebarOpen] = useState(false);

	if (!isLoaded) return null;
	if (!isAdmin) return <Navigate to="/dashboard" replace />;

	return (
		<div>
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
								<Logo />
							</div>
							<AdminNav onNavigate={() => setSidebarOpen(false)} />
						</div>
					</DialogPanel>
				</div>
			</Dialog>

			<div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
				<div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 dark:border-white/10 dark:bg-black/10">
					<div className="flex h-16 shrink-0 items-center">
						<Logo />
					</div>
					<AdminNav />
				</div>
			</div>

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
					{t("admin.title")}
				</div>
			</div>

			<main className="py-10 lg:pl-72 dark:bg-gray-900 min-h-screen">
				<div className="px-4 sm:px-6 lg:px-8">
					<Outlet />
				</div>
			</main>
		</div>
	);
}

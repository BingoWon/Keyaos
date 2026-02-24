import {
	Dialog,
	DialogBackdrop,
	DialogPanel,
	TransitionChild,
} from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { UserMenu } from "../auth";
import { Logo } from "./Logo";

interface BaseSidebarLayoutProps {
	navigation: (onClose?: () => void) => ReactNode;
	mobileTitle: string;
}

export function BaseSidebarLayout({
	navigation,
	mobileTitle,
}: BaseSidebarLayoutProps) {
	const [sidebarOpen, setSidebarOpen] = useState(false);

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
							<div className="flex h-16 shrink-0 items-center justify-between">
								<Logo />
								<UserMenu />
							</div>
							{navigation(() => setSidebarOpen(false))}
						</div>
					</DialogPanel>
				</div>
			</Dialog>

			<div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
				<div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 dark:border-white/10 dark:bg-black/10">
					<div className="flex h-16 shrink-0 items-center justify-between">
						<Logo />
						<UserMenu />
					</div>
					{navigation()}
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
					{mobileTitle}
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

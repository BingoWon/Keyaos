import {
	Dialog,
	DialogBackdrop,
	DialogPanel,
	TransitionChild,
} from "@headlessui/react";
import {
	Bars3Icon,
	BookOpenIcon,
	ChatBubbleLeftRightIcon,
	CheckIcon,
	ClipboardDocumentIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	DocumentTextIcon,
	GlobeAltIcon,
	KeyIcon,
	LinkIcon,
	ShieldCheckIcon,
	SparklesIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import {
	BookOpenIcon as BookOpenIconSolid,
	ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
	CreditCardIcon as CreditCardIconSolid,
	CurrencyDollarIcon as CurrencyDollarIconSolid,
	DocumentTextIcon as DocumentTextIconSolid,
	GlobeAltIcon as GlobeAltIconSolid,
	KeyIcon as KeyIconSolid,
	LinkIcon as LinkIconSolid,
	ShieldCheckIcon as ShieldCheckIconSolid,
	SparklesIcon as SparklesIconSolid,
} from "@heroicons/react/24/solid";
import type { ComponentType, SVGProps } from "react";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import { PageLoader } from "../../components/PageLoader";
import { classNames } from "../../utils/classNames";
import { TOKENS } from "../../utils/colors";
import { DocSearch } from "./DocSearch";
import { TableOfContents } from "./TableOfContents";

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

/* ── Page Copy Button ──────────────────────────────────── */

function PageCopyButton() {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		const content = document.querySelector<HTMLElement>("[data-docs-content]");
		if (!content) return;
		await navigator.clipboard.writeText(content.innerText);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 dark:border-white/10 dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-white"
		>
			{copied ? (
				<>
					<CheckIcon className={`size-3.5 ${TOKENS.green.text}`} />
					<span>{t("docs.copied")}</span>
				</>
			) : (
				<>
					<ClipboardDocumentIcon className="size-3.5" />
					<span>{t("docs.copy_page")}</span>
				</>
			)}
		</button>
	);
}

/* ── Sidebar Nav ──────────────────────────────────────── */

interface NavItem {
	name: string;
	href: string;
	icon: HeroIcon;
	activeIcon: HeroIcon;
}

interface NavSection {
	label: string;
	items: NavItem[];
}

function SidebarNav({
	sections,
	onNavigate,
}: {
	sections: NavSection[];
	onNavigate?: () => void;
}) {
	return (
		<nav className="flex flex-1 flex-col">
			<ul className="flex flex-1 flex-col gap-y-7">
				{sections.map((section) => (
					<li key={section.label}>
						<h3 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
							{section.label}
						</h3>
						<ul className="space-y-1">
							{section.items.map((item) => (
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
												"group flex gap-x-3 rounded-lg px-2 py-2 text-sm font-medium",
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
															"size-[18px] shrink-0",
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
					</li>
				))}
			</ul>
		</nav>
	);
}

/* ── Layout ────────────────────────────────────────────── */

export function DocsLayout() {
	const { t } = useTranslation();
	const [sidebarOpen, setSidebarOpen] = useState(false);

	const navSections: NavSection[] = [
		{
			label: t("docs.section_getting_started"),
			items: [
				{
					name: t("docs.nav_introduction"),
					href: "/docs/introduction",
					icon: SparklesIcon,
					activeIcon: SparklesIconSolid,
				},
				{
					name: t("docs.nav_quickstart"),
					href: "/docs/quickstart",
					icon: BookOpenIcon,
					activeIcon: BookOpenIconSolid,
				},
				{
					name: t("docs.nav_authentication"),
					href: "/docs/authentication",
					icon: KeyIcon,
					activeIcon: KeyIconSolid,
				},
			],
		},
		{
			label: t("docs.section_concepts"),
			items: [
				{
					name: t("docs.nav_models_routing"),
					href: "/docs/models-routing",
					icon: GlobeAltIcon,
					activeIcon: GlobeAltIconSolid,
				},
				{
					name: t("docs.nav_credentials_sharing"),
					href: "/docs/credentials-sharing",
					icon: LinkIcon,
					activeIcon: LinkIconSolid,
				},
				{
					name: t("docs.nav_pricing"),
					href: "/docs/pricing",
					icon: CurrencyDollarIcon,
					activeIcon: CurrencyDollarIconSolid,
				},
				{
					name: t("docs.nav_credits"),
					href: "/docs/credits",
					icon: CreditCardIcon,
					activeIcon: CreditCardIconSolid,
				},
			],
		},
		{
			label: t("docs.section_legal"),
			items: [
				{
					name: t("docs.nav_terms"),
					href: "/docs/terms-of-service",
					icon: DocumentTextIcon,
					activeIcon: DocumentTextIconSolid,
				},
				{
					name: t("docs.nav_privacy"),
					href: "/docs/privacy-policy",
					icon: ShieldCheckIcon,
					activeIcon: ShieldCheckIconSolid,
				},
				{
					name: t("docs.nav_contact"),
					href: "/docs/contact",
					icon: ChatBubbleLeftRightIcon,
					activeIcon: ChatBubbleLeftRightIconSolid,
				},
			],
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
						<div className="flex grow flex-col gap-y-4 overflow-y-auto bg-white px-5 pt-4 pb-2 dark:bg-gray-900 dark:ring dark:ring-white/10">
							<DocSearch />
							<SidebarNav
								sections={navSections}
								onNavigate={() => setSidebarOpen(false)}
							/>
						</div>
					</DialogPanel>
				</div>
			</Dialog>

			{/* Desktop sidebar — below top nav */}
			<div className="hidden lg:fixed lg:inset-y-0 lg:top-14 lg:z-40 lg:flex lg:w-60 lg:flex-col">
				<div className="flex grow flex-col gap-y-4 overflow-y-auto border-r border-gray-200 bg-white px-5 pt-4 dark:border-white/10 dark:bg-black/10">
					<DocSearch />
					<SidebarNav sections={navSections} />
				</div>
			</div>

			{/* Mobile hamburger bar — below top nav */}
			<div className="sticky top-14 z-40 flex items-center gap-x-6 bg-white px-4 py-3 shadow-xs sm:px-6 lg:hidden dark:border-b dark:border-white/10 dark:bg-gray-900 dark:shadow-none">
				<button
					type="button"
					onClick={() => setSidebarOpen(true)}
					className="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
				>
					<span className="sr-only">Open sidebar</span>
					<Bars3Icon aria-hidden="true" className="size-6" />
				</button>
				<div className="flex-1 text-sm/6 font-semibold text-gray-900 dark:text-white">
					{t("docs.title")}
				</div>
			</div>

			{/* Content area — below top nav, right of sidebar */}
			<main className="min-h-dvh pt-14 lg:pl-60">
				<div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
					<div className="lg:grid lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_220px]">
						<div className="min-w-0">
							<div className="flex justify-end sm:mb-6">
								<PageCopyButton />
							</div>
							<div data-docs-content>
								<Suspense fallback={<PageLoader />}>
									<Outlet />
								</Suspense>
							</div>
						</div>
						<aside className="hidden lg:block">
							<div className="sticky top-24">
								<TableOfContents />
							</div>
						</aside>
					</div>
				</div>
			</main>
		</div>
	);
}

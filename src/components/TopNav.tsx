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
	CodeBracketIcon,
	CpuChipIcon,
	MagnifyingGlassIcon,
	ServerStackIcon,
	UserGroupIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { isPlatform, UserMenu, useAuth } from "../auth";
import { useFetch } from "../hooks/useFetch";
import type { ModelEntry } from "../types/model";
import { classNames } from "../utils/classNames";
import { aggregateModels } from "../utils/models";
import { LanguageSelector } from "./LanguageSelector";
import { Logo } from "./Logo";
import { OrgLogo } from "./OrgLogo";
import { ThemeToggle } from "./ThemeToggle";

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

const NAV_LINKS = [
	{ key: "nav.models", href: "/models", icon: CpuChipIcon },
	{ key: "nav.providers", href: "/providers", icon: ServerStackIcon },
	{ key: "nav.chat", href: "/chat", icon: ChatBubbleLeftRightIcon },
	{ key: "nav.werewolf", href: "/werewolf", icon: UserGroupIcon },
	{ key: "nav.docs", href: "/docs", icon: BookOpenIcon },
	{ key: "nav.api", href: "/api-reference", icon: CodeBracketIcon },
] as const;

const SEARCH_PREVIEW_LIMIT = 8;

function ModelSearch() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [q, setQ] = useState("");
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [activeIdx, setActiveIdx] = useState(-1);

	const { data: raw } = useFetch<ModelEntry[]>("/api/models", {
		requireAuth: false,
	});
	const groups = useMemo(() => aggregateModels(raw ?? []), [raw]);

	const results = useMemo(() => {
		const trimmed = q.trim();
		if (!trimmed) return groups.slice(0, SEARCH_PREVIEW_LIMIT);
		const lower = trimmed.toLowerCase();
		return groups
			.filter(
				(g) =>
					g.id.toLowerCase().includes(lower) ||
					g.displayName.toLowerCase().includes(lower),
			)
			.slice(0, SEARCH_PREVIEW_LIMIT);
	}, [q, groups]);

	const showPanel = open && groups.length > 0;

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset selection on every keystroke
	useEffect(() => setActiveIdx(-1), [q]);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		const handleSlash = (e: KeyboardEvent) => {
			if (e.key !== "/") return;
			const tag = (e.target as HTMLElement).tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			if ((e.target as HTMLElement).isContentEditable) return;
			e.preventDefault();
			inputRef.current?.focus();
		};
		document.addEventListener("keydown", handleSlash);
		return () => document.removeEventListener("keydown", handleSlash);
	}, []);

	const goToModel = (modelId: string) => {
		navigate(`/${modelId}`);
		setQ("");
		setOpen(false);
		inputRef.current?.blur();
	};

	const goToSearch = (query: string) => {
		navigate(query ? `/models?q=${encodeURIComponent(query)}` : "/models");
		setQ("");
		setOpen(false);
		inputRef.current?.blur();
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.nativeEvent.isComposing) return;

		if (!showPanel || results.length === 0) {
			if (e.key === "Enter") {
				e.preventDefault();
				goToSearch(q.trim());
			}
			return;
		}
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIdx((i) => (i + 1) % results.length);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIdx((i) => (i <= 0 ? results.length - 1 : i - 1));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (activeIdx >= 0 && results[activeIdx]) {
				goToModel(results[activeIdx].id);
			} else {
				goToSearch(q.trim());
			}
		} else if (e.key === "Escape") {
			setOpen(false);
		}
	};

	return (
		<div ref={containerRef} className="relative hidden lg:block">
			<MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
			{!open && !q && (
				<kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-gray-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-gray-400 dark:border-white/10 dark:bg-white/10 dark:text-gray-500">
					/
				</kbd>
			)}
			<input
				ref={inputRef}
				type="text"
				value={q}
				onChange={(e) => {
					setQ(e.target.value);
					setOpen(true);
				}}
				onFocus={() => setOpen(true)}
				onKeyDown={onKeyDown}
				placeholder={t("models.search_placeholder")}
				className="h-8 w-72 rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-8 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-brand-400 focus:bg-white focus:ring-1 focus:ring-brand-400/30 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-500 dark:focus:bg-white/10"
				role="combobox"
				aria-expanded={showPanel}
				aria-autocomplete="list"
				aria-controls="model-search-listbox"
			/>

			{showPanel && (
				<div
					id="model-search-listbox"
					role="listbox"
					className="absolute left-0 top-full z-50 mt-1.5 w-96 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-800"
				>
					{results.length > 0 ? (
						<div className="max-h-80 overflow-y-auto py-1">
							{results.map((g, i) => (
								<div
									key={g.id}
									tabIndex={-1}
									role="option"
									aria-selected={i === activeIdx}
									onMouseEnter={() => setActiveIdx(i)}
									onClick={() => goToModel(g.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter") goToModel(g.id);
									}}
									className={classNames(
										"flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-gray-900 transition-colors dark:text-white",
										i === activeIdx
											? "bg-brand-50 dark:bg-brand-500/15"
											: "hover:bg-gray-50 dark:hover:bg-white/5",
									)}
								>
									<OrgLogo modelId={g.id} size={16} />
									<span className="min-w-0 truncate">{g.displayName}</span>
								</div>
							))}
						</div>
					) : (
						<div className="px-3 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
							{t("models.no_match", { query: q.trim() })}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export function TopNav() {
	const { t } = useTranslation();
	const { isLoaded, isSignedIn } = useAuth();
	const authed = isLoaded && isSignedIn;
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	return (
		<>
			<header className="fixed inset-x-0 top-0 z-50 h-14 border-b border-gray-200/50 bg-white/70 backdrop-blur-lg dark:border-white/5 dark:bg-gray-950/70">
				<nav className="flex h-full items-center justify-between px-4 lg:px-6">
					<div className="flex items-center gap-4">
						<Logo size="md" />
						<ModelSearch />
					</div>

					<div className="flex items-center gap-1">
						{NAV_LINKS.map(({ key, href }) => (
							<NavLink
								key={href}
								to={href}
								className={({ isActive }) =>
									classNames(
										"hidden rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:inline-flex",
										isActive
											? "text-brand-600 dark:text-brand-400"
											: "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
									)
								}
							>
								{t(key)}
							</NavLink>
						))}

						<div className="mx-1.5 hidden h-4 w-px bg-gray-200 sm:block dark:bg-white/10" />

						<ThemeToggle />
						<LanguageSelector />
						<a
							href={GITHUB_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="hidden rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:inline-flex dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
							aria-label="GitHub"
						>
							<GitHubIcon className="size-5" />
						</a>

						<div className="mx-1.5 hidden h-4 w-px bg-gray-200 sm:block dark:bg-white/10" />

						{authed ? (
							<div className="flex items-center gap-2">
								<Link
									to="/dashboard"
									className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-brand-500/20 transition-colors hover:bg-brand-600 dark:hover:bg-brand-400"
								>
									{t("nav.dashboard")}
								</Link>
								{isPlatform && <UserMenu />}
							</div>
						) : (
							<div className="flex items-center gap-1.5">
								<Link
									to="/login"
									className="hidden items-center px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900 sm:inline-flex dark:text-gray-400 dark:hover:text-white"
								>
									{t("landing.cta_signup")}
								</Link>
								<Link
									to="/login"
									className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-brand-500/20 transition-colors hover:bg-brand-600 dark:hover:bg-brand-400"
								>
									{t("landing.cta_signin")}
								</Link>
							</div>
						)}

						{/* Mobile hamburger */}
						<button
							type="button"
							onClick={() => setMobileMenuOpen(true)}
							className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:hidden dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
							aria-label="Open menu"
						>
							<Bars3Icon className="size-5" />
						</button>
					</div>
				</nav>
			</header>

			{/* Mobile navigation drawer */}
			<Dialog
				open={mobileMenuOpen}
				onClose={setMobileMenuOpen}
				className="relative z-[60] sm:hidden"
			>
				<DialogBackdrop
					transition
					className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity duration-300 ease-linear data-closed:opacity-0"
				/>
				<div className="fixed inset-0 flex justify-end">
					<DialogPanel
						transition
						className="relative w-full max-w-xs transform bg-white shadow-xl transition duration-300 ease-in-out data-closed:translate-x-full dark:bg-gray-900"
					>
						<TransitionChild>
							<div className="absolute top-3 left-0 -ml-12 flex w-12 justify-center duration-300 ease-in-out data-closed:opacity-0">
								<button
									type="button"
									onClick={() => setMobileMenuOpen(false)}
									className="rounded-md p-1.5 text-white"
								>
									<XMarkIcon className="size-6" />
								</button>
							</div>
						</TransitionChild>

						<div className="flex h-full flex-col overflow-y-auto px-5 py-6">
							<div className="flex items-center justify-between">
								<Logo size="md" />
							</div>

							<nav className="mt-8 flex flex-col gap-1.5">
								{NAV_LINKS.map(({ key, href, icon: Icon }) => (
									<NavLink
										key={href}
										to={href}
										onClick={() => setMobileMenuOpen(false)}
										className={({ isActive }) =>
											classNames(
												"flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors",
												isActive
													? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
													: "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white",
											)
										}
									>
										<Icon className="size-5" />
										{t(key)}
									</NavLink>
								))}
							</nav>

							<div className="mt-auto border-t border-gray-200 pt-5 dark:border-white/10">
								<a
									href={GITHUB_URL}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
								>
									<GitHubIcon className="size-5" />
									GitHub
								</a>
							</div>
						</div>
					</DialogPanel>
				</div>
			</Dialog>
		</>
	);
}

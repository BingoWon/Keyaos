import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

interface DocEntry {
	title: string;
	href: string;
	section: string;
}

function buildIndex(t: (key: string) => string): DocEntry[] {
	return [
		// User Guide
		{
			title: t("docs.nav_quickstart"),
			href: "/docs/quickstart",
			section: t("docs.section_user_guide"),
		},
		{
			title: t("docs.nav_models_routing"),
			href: "/docs/models-routing",
			section: t("docs.section_user_guide"),
		},
		{
			title: t("docs.nav_credentials_sharing"),
			href: "/docs/credentials-sharing",
			section: t("docs.section_user_guide"),
		},
		{
			title: t("docs.nav_pricing"),
			href: "/docs/pricing",
			section: t("docs.section_user_guide"),
		},
		{
			title: t("docs.nav_billing"),
			href: "/docs/billing",
			section: t("docs.section_user_guide"),
		},
		// API Reference
		{
			title: t("docs.nav_authentication"),
			href: "/docs/authentication",
			section: t("docs.section_api_reference"),
		},
		{
			title: t("docs.nav_openai_api"),
			href: "/docs/openai-api",
			section: t("docs.section_api_reference"),
		},
		{
			title: t("docs.nav_anthropic_api"),
			href: "/docs/anthropic-api",
			section: t("docs.section_api_reference"),
		},
		{
			title: t("docs.nav_error_codes"),
			href: "/docs/error-codes",
			section: t("docs.section_api_reference"),
		},
		{
			title: t("docs.nav_models_api"),
			href: "/docs/models-api",
			section: t("docs.section_api_reference"),
		},
		{
			title: t("docs.nav_credits_api"),
			href: "/docs/credits-api",
			section: t("docs.section_api_reference"),
		},
		// Support
		{
			title: t("docs.nav_terms"),
			href: "/docs/terms-of-service",
			section: t("docs.section_support"),
		},
		{
			title: t("docs.nav_privacy"),
			href: "/docs/privacy-policy",
			section: t("docs.section_support"),
		},
		{
			title: t("docs.nav_contact"),
			href: "/docs/contact",
			section: t("docs.section_support"),
		},
	];
}

export function DocSearch() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const [activeIdx, setActiveIdx] = useState(0);

	const index = useMemo(() => buildIndex(t), [t]);

	const results = useMemo(() => {
		if (!query.trim()) return index;
		const q = query.toLowerCase();
		return index.filter(
			(e) =>
				e.title.toLowerCase().includes(q) ||
				e.section.toLowerCase().includes(q),
		);
	}, [query, index]);

	const go = useCallback(
		(href: string) => {
			navigate(href);
			setOpen(false);
			setQuery("");
		},
		[navigate],
	);

	// ⌘K / Ctrl+K global shortcut
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen((v) => !v);
			}
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	// Focus input when opened
	useEffect(() => {
		if (open) {
			setQuery("");
			setActiveIdx(0);
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset
	useEffect(() => setActiveIdx(0), [results]);

	// Keyboard navigation
	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIdx((i) => Math.min(i + 1, results.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIdx((i) => Math.max(i - 1, 0));
		} else if (e.key === "Enter" && results[activeIdx]) {
			go(results[activeIdx].href);
		}
	};

	// Scroll active item into view
	useEffect(() => {
		listRef.current?.children[activeIdx]?.scrollIntoView({ block: "nearest" });
	}, [activeIdx]);

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-500 dark:hover:border-white/20 dark:hover:text-gray-400"
			>
				<MagnifyingGlassIcon className="size-4" />
				<span className="flex-1 text-left">{t("docs.search_placeholder")}</span>
				<kbd className="hidden rounded border border-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 sm:inline dark:border-white/10 dark:text-gray-500">
					⌘K
				</kbd>
			</button>
		);
	}

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: dismiss overlay */}
			<div
				className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
				onClick={() => setOpen(false)}
				onKeyDown={() => {}}
			/>

			{/* Dialog */}
			<div className="fixed inset-x-0 top-[15%] z-[101] mx-auto w-full max-w-lg px-4">
				<div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900">
					{/* Search input */}
					<div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/5">
						<MagnifyingGlassIcon className="size-5 text-gray-400 dark:text-gray-500" />
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={onKeyDown}
							placeholder={t("docs.search_placeholder")}
							className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
						/>
						<kbd className="rounded border border-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 dark:border-white/10 dark:text-gray-500">
							ESC
						</kbd>
					</div>

					{/* Results */}
					<ul ref={listRef} className="max-h-80 overflow-y-auto py-2">
						{results.length === 0 ? (
							<li className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
								{t("docs.search_no_results")}
							</li>
						) : (
							results.map((entry, i) => (
								<li key={entry.href}>
									<button
										type="button"
										onClick={() => go(entry.href)}
										onMouseEnter={() => setActiveIdx(i)}
										className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
											i === activeIdx
												? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
												: "text-gray-700 dark:text-gray-300"
										}`}
									>
										<MagnifyingGlassIcon className="size-4 shrink-0 text-gray-400 dark:text-gray-500" />
										<div className="flex-1 min-w-0">
											<div className="font-medium truncate">{entry.title}</div>
											<div className="text-xs text-gray-400 dark:text-gray-500">
												{entry.section}
											</div>
										</div>
									</button>
								</li>
							))
						)}
					</ul>
				</div>
			</div>
		</>
	);
}

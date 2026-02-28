import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

/* ── Pagefind lazy loader ─────────────────────────────── */

interface PagefindResult {
	url: string;
	excerpt: string;
	meta: { title?: string; section?: string };
}

interface PagefindSearchResult {
	id: string;
	data: () => Promise<PagefindResult>;
}

interface PagefindInstance {
	search: (query: string) => Promise<{ results: PagefindSearchResult[] }>;
	destroy?: () => void;
}

let pagefindPromise: Promise<PagefindInstance> | null = null;

async function getPagefind(): Promise<PagefindInstance> {
	if (!pagefindPromise) {
		// Runtime-only import — bypasses Vite/Rollup bundling
		const importFn = new Function(
			"return import('/pagefind/pagefind.js')",
		) as () => Promise<PagefindInstance>;
		pagefindPromise = importFn();
	}
	return pagefindPromise;
}

/* ── Static fallback index (nav items) ────────────────── */

interface DocEntry {
	url: string;
	title: string;
	section: string;
	excerpt: string;
}

function buildFallbackIndex(t: (key: string) => string): DocEntry[] {
	return [
		{
			url: "/docs/quickstart",
			title: t("docs.nav_quickstart"),
			section: t("docs.section_user_guide"),
			excerpt: "",
		},
		{
			url: "/docs/models-routing",
			title: t("docs.nav_models_routing"),
			section: t("docs.section_user_guide"),
			excerpt: "",
		},
		{
			url: "/docs/credentials-sharing",
			title: t("docs.nav_credentials_sharing"),
			section: t("docs.section_user_guide"),
			excerpt: "",
		},
		{
			url: "/docs/pricing",
			title: t("docs.nav_pricing"),
			section: t("docs.section_user_guide"),
			excerpt: "",
		},
		{
			url: "/docs/billing",
			title: t("docs.nav_billing"),
			section: t("docs.section_user_guide"),
			excerpt: "",
		},
		{
			url: "/docs/authentication",
			title: t("docs.nav_authentication"),
			section: t("docs.section_api_reference"),
			excerpt: "",
		},
		{
			url: "/docs/openai-api",
			title: t("docs.nav_openai_api"),
			section: t("docs.section_api_reference"),
			excerpt: "",
		},
		{
			url: "/docs/anthropic-api",
			title: t("docs.nav_anthropic_api"),
			section: t("docs.section_api_reference"),
			excerpt: "",
		},
		{
			url: "/docs/error-codes",
			title: t("docs.nav_error_codes"),
			section: t("docs.section_api_reference"),
			excerpt: "",
		},
		{
			url: "/docs/models-api",
			title: t("docs.nav_models_api"),
			section: t("docs.section_api_reference"),
			excerpt: "",
		},
		{
			url: "/docs/credits-api",
			title: t("docs.nav_credits_api"),
			section: t("docs.section_api_reference"),
			excerpt: "",
		},
		{
			url: "/docs/terms-of-service",
			title: t("docs.nav_terms"),
			section: t("docs.section_support"),
			excerpt: "",
		},
		{
			url: "/docs/privacy-policy",
			title: t("docs.nav_privacy"),
			section: t("docs.section_support"),
			excerpt: "",
		},
		{
			url: "/docs/contact",
			title: t("docs.nav_contact"),
			section: t("docs.section_support"),
			excerpt: "",
		},
	];
}

/* ── DocSearch component ──────────────────────────────── */

export function DocSearch() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<DocEntry[]>([]);
	const [searching, setSearching] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const [activeIdx, setActiveIdx] = useState(0);

	const fallback = useMemo(() => buildFallbackIndex(t), [t]);

	// Search with pagefind or fallback to title matching
	const doSearch = useCallback(
		async (q: string) => {
			if (!q.trim()) {
				setResults(fallback);
				return;
			}

			setSearching(true);
			try {
				const pf = await getPagefind();
				const { results: pfResults } = await pf.search(q);
				const entries = await Promise.all(
					pfResults.slice(0, 8).map(async (r) => {
						const data = await r.data();
						return {
							url: data.url,
							title: data.meta.title || data.url,
							section: data.meta.section || "Docs",
							excerpt: data.excerpt,
						};
					}),
				);
				setResults(entries.length ? entries : []);
			} catch {
				// Pagefind not available (dev mode) → fallback to title filter
				const lq = q.toLowerCase();
				setResults(
					fallback.filter(
						(e) =>
							e.title.toLowerCase().includes(lq) ||
							e.section.toLowerCase().includes(lq),
					),
				);
			} finally {
				setSearching(false);
			}
		},
		[fallback],
	);

	// Debounced search
	useEffect(() => {
		const timer = setTimeout(() => doSearch(query), 150);
		return () => clearTimeout(timer);
	}, [query, doSearch]);

	const go = useCallback(
		(url: string) => {
			navigate(url);
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
			setResults(fallback);
			setActiveIdx(0);
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open, fallback]);

	// Reset active index when results change
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
			go(results[activeIdx].url);
		}
	};

	// Scroll active item into view
	useEffect(() => {
		listRef.current?.children[activeIdx]?.scrollIntoView({
			block: "nearest",
		});
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

			<div className="fixed inset-x-0 top-[15%] z-[101] mx-auto w-full max-w-lg px-4">
				<div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900">
					{/* Input */}
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
						{searching && (
							<div className="size-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
						)}
						<kbd className="rounded border border-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 dark:border-white/10 dark:text-gray-500">
							ESC
						</kbd>
					</div>

					{/* Results */}
					<ul ref={listRef} className="max-h-80 overflow-y-auto py-2">
						{results.length === 0 ? (
							<li className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
								{searching ? "..." : t("docs.search_no_results")}
							</li>
						) : (
							results.map((entry, i) => (
								<li key={entry.url}>
									<button
										type="button"
										onClick={() => go(entry.url)}
										onMouseEnter={() => setActiveIdx(i)}
										className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
											i === activeIdx
												? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
												: "text-gray-700 dark:text-gray-300"
										}`}
									>
										<MagnifyingGlassIcon className="size-4 shrink-0 text-gray-400 dark:text-gray-500" />
										<div className="min-w-0 flex-1">
											<div className="truncate font-medium">{entry.title}</div>
											{entry.excerpt ? (
												<div
													className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500 [&>mark]:bg-brand-100 [&>mark]:text-brand-700 dark:[&>mark]:bg-brand-500/20 dark:[&>mark]:text-brand-300"
													// biome-ignore lint/security/noDangerouslySetInnerHtml: pagefind excerpt is safe
													dangerouslySetInnerHTML={{
														__html: entry.excerpt,
													}}
												/>
											) : (
												<div className="text-xs text-gray-400 dark:text-gray-500">
													{entry.section}
												</div>
											)}
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

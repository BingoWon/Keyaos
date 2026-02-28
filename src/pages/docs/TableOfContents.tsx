import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { classNames } from "../../utils/classNames";

interface TocItem {
	id: string;
	text: string;
	level: number;
}

export function TableOfContents() {
	const [items, setItems] = useState<TocItem[]>([]);
	const [activeId, setActiveId] = useState<string>("");
	const observerRef = useRef<IntersectionObserver | null>(null);
	const { pathname } = useLocation();

	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers re-extraction on navigation
	useEffect(() => {
		// Small delay to let MDX content render into the DOM
		const timer = setTimeout(() => {
			const headings = document.querySelectorAll<HTMLElement>(
				"[data-docs-content] h2[id], [data-docs-content] h3[id]",
			);
			const tocItems: TocItem[] = Array.from(headings).map((h) => ({
				id: h.id,
				text: h.textContent ?? "",
				level: h.tagName === "H2" ? 2 : 3,
			}));
			setItems(tocItems);
			setActiveId("");

			// IntersectionObserver for scroll-active highlighting
			observerRef.current?.disconnect();
			observerRef.current = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							setActiveId(entry.target.id);
						}
					}
				},
				{ rootMargin: "-80px 0px -60% 0px", threshold: 0.1 },
			);

			for (const h of headings) {
				observerRef.current.observe(h);
			}
		}, 100);

		return () => {
			clearTimeout(timer);
			observerRef.current?.disconnect();
		};
	}, [pathname]);

	if (items.length === 0) return null;

	return (
		<nav className="border-l border-gray-200 pl-4 text-sm dark:border-white/10">
			<h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-200">
				On this page
			</h4>
			<ul className="space-y-1.5">
				{items.map((item) => (
					<li key={item.id}>
						<a
							href={`#${item.id}`}
							onClick={(e) => {
								e.preventDefault();
								document
									.getElementById(item.id)
									?.scrollIntoView({ behavior: "smooth" });
								setActiveId(item.id);
							}}
							className={classNames(
								item.level === 3 ? "pl-3" : "",
								activeId === item.id
									? "text-brand-600 dark:text-brand-400 font-medium"
									: "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
								"block truncate transition-colors text-[13px] leading-relaxed",
							)}
						>
							{item.text}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}

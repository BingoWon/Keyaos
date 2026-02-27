import { useEffect, useRef, useState } from "react";
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

	// Extract headings from DOM after MDX renders
	useEffect(() => {
		const headings = document.querySelectorAll<HTMLElement>(
			"main h2[id], main h3[id]",
		);
		const tocItems: TocItem[] = Array.from(headings).map((h) => ({
			id: h.id,
			text: h.textContent ?? "",
			level: h.tagName === "H2" ? 2 : 3,
		}));
		setItems(tocItems);

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

		return () => observerRef.current?.disconnect();
	}, []);

	if (items.length === 0) return null;

	return (
		<nav className="text-sm">
			<h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
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

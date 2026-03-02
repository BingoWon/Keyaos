import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";

function pageRange(current: number, total: number): (number | "...")[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

	const pages: (number | "...")[] = [1];
	const left = Math.max(2, current - 1);
	const right = Math.min(total - 1, current + 1);

	if (left > 2) pages.push("...");
	for (let i = left; i <= right; i++) pages.push(i);
	if (right < total - 1) pages.push("...");
	if (total > 1) pages.push(total);

	return pages;
}

export function Pagination({
	page,
	totalPages,
	onChange,
}: {
	page: number;
	totalPages: number;
	onChange: (p: number) => void;
}) {
	if (totalPages <= 1) return null;

	const btnBase =
		"inline-flex items-center justify-center size-8 rounded-md text-xs font-medium transition-colors";
	const btnIdle =
		"text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10";
	const btnActive = "bg-brand-500 text-white";
	const btnDisabled = "opacity-30 pointer-events-none";

	return (
		<nav className="flex items-center gap-1">
			<button
				type="button"
				disabled={page <= 1}
				onClick={() => onChange(page - 1)}
				className={`${btnBase} ${page <= 1 ? btnDisabled : btnIdle}`}
			>
				<ChevronLeftIcon className="size-4" />
			</button>
			{pageRange(page, totalPages).map((p, idx) =>
				p === "..." ? (
					<span
						key={`dots-${idx < 3 ? "start" : "end"}`}
						className="inline-flex items-center justify-center size-8 text-xs text-gray-400"
					>
						…
					</span>
				) : (
					<button
						key={p}
						type="button"
						onClick={() => onChange(p)}
						className={`${btnBase} ${p === page ? btnActive : btnIdle}`}
					>
						{p}
					</button>
				),
			)}
			<button
				type="button"
				disabled={page >= totalPages}
				onClick={() => onChange(page + 1)}
				className={`${btnBase} ${page >= totalPages ? btnDisabled : btnIdle}`}
			>
				<ChevronRightIcon className="size-4" />
			</button>
		</nav>
	);
}

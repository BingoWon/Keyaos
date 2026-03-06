import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router-dom";

interface Crumb {
	label: string;
	to?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
	return (
		<nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
			{items.map((item, i) => {
				const isLast = i === items.length - 1;
				return (
					<span key={item.label} className="flex items-center gap-1.5">
						{i > 0 && (
							<ChevronRightIcon className="size-3.5 text-gray-300 dark:text-gray-600" />
						)}
						{item.to && !isLast ? (
							<Link
								to={item.to}
								className="font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
							>
								{item.label}
							</Link>
						) : (
							<span className="font-medium text-gray-900 dark:text-white truncate">
								{item.label}
							</span>
						)}
					</span>
				);
			})}
		</nav>
	);
}

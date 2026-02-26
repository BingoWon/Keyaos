import { ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { useEffect, useRef, useState } from "react";
import type { ProviderMeta } from "../types/provider";
import { ProviderLogo } from "./ProviderLogo";

interface ProviderSelectProps {
	id?: string;
	providers: ProviderMeta[];
	value: string;
	onChange: (id: string) => void;
}

export function ProviderSelect({
	id,
	providers,
	value,
	onChange,
}: ProviderSelectProps) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const selected = providers.find((p) => p.id === value);

	useEffect(() => {
		function onClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		}
		if (open) document.addEventListener("mousedown", onClickOutside);
		return () => document.removeEventListener("mousedown", onClickOutside);
	}, [open]);

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				id={id}
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
			>
				{selected && (
					<ProviderLogo src={selected.logoUrl} name={selected.name} size={18} />
				)}
				<span className="truncate">{selected?.name ?? value}</span>
				<ChevronUpDownIcon className="pointer-events-none absolute right-2 size-4 text-gray-400" />
			</button>

			{open && (
				<ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-white/10 dark:bg-gray-800">
					{providers.map((p) => (
						<li key={p.id}>
							<button
								type="button"
								onClick={() => {
									onChange(p.id);
									setOpen(false);
								}}
								className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${
									p.id === value
										? "font-medium text-brand-600 dark:text-brand-400"
										: "text-gray-700 dark:text-gray-300"
								}`}
							>
								<ProviderLogo src={p.logoUrl} name={p.name} size={18} />
								<span className="truncate">{p.name}</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

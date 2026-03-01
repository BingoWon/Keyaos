import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useCallback, useEffect, useRef } from "react";

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
}

export function SearchBar({
	value,
	onChange,
	placeholder = "Search…",
	className = "",
}: SearchBarProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				inputRef.current?.focus();
			}
			if (
				e.key === "Escape" &&
				document.activeElement === inputRef.current
			) {
				onChange("");
				inputRef.current?.blur();
			}
		},
		[onChange],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	return (
		<div className={`relative flex-1 sm:flex-none sm:w-72 ${className}`}>
			<MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 dark:text-gray-500" />
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] py-2 pl-9 pr-20 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
			/>
			<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
				{value ? (
					<button
						type="button"
						onClick={() => {
							onChange("");
							inputRef.current?.focus();
						}}
						className="rounded-md p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
					>
						<XMarkIcon className="size-4" />
					</button>
				) : (
					<kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">
						⌘K
					</kbd>
				)}
			</div>
		</div>
	);
}

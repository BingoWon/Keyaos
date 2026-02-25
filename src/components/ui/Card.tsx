import type { ReactNode } from "react";

interface CardProps {
	children: ReactNode;
	className?: string;
}

export function Card({ children, className = "" }: CardProps) {
	return (
		<div
			className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 ${className}`}
		>
			{children}
		</div>
	);
}

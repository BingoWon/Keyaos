import type { ReactNode } from "react";

type Variant = "default" | "brand" | "accent" | "success" | "warning" | "error";

interface BadgeProps {
	variant?: Variant;
	children: ReactNode;
	className?: string;
}

const variantClass: Record<Variant, string> = {
	default: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
	brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
	accent:
		"bg-accent-50 text-accent-700 dark:bg-accent-400/15 dark:text-accent-300",
	success:
		"bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400",
	warning:
		"bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400",
	error: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

export function Badge({
	variant = "default",
	children,
	className = "",
}: BadgeProps) {
	return (
		<span
			className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClass[variant]} ${className}`}
		>
			{children}
		</span>
	);
}

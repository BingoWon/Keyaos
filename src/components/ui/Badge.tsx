import type { ReactNode } from "react";
import { TOKENS, type TokenName } from "../../utils/colors";

type Variant =
	| "default"
	| "brand"
	| "accent"
	| "success"
	| "warning"
	| "error"
	| "info";

interface BadgeProps {
	variant?: Variant;
	children: ReactNode;
	className?: string;
}

const VARIANT_TO_TOKEN: Partial<Record<Variant, TokenName>> = {
	success: "green",
	warning: "yellow",
	error: "red",
	info: "blue",
};

const DEFAULT_CLASS =
	"bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";

const STATIC_VARIANTS: Partial<Record<Variant, string>> = {
	default: DEFAULT_CLASS,
	brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
	accent:
		"bg-accent-50 text-accent-700 dark:bg-accent-400/15 dark:text-accent-300",
};

function variantClass(v: Variant): string {
	const tokenName = VARIANT_TO_TOKEN[v];
	if (tokenName) return TOKENS[tokenName].soft;
	return STATIC_VARIANTS[v] ?? DEFAULT_CLASS;
}

export function Badge({
	variant = "default",
	children,
	className = "",
}: BadgeProps) {
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClass(variant)} ${className}`}
		>
			{children}
		</span>
	);
}

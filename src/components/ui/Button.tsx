import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "destructive";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
}

const variantClass: Record<Variant, string> = {
	primary:
		"bg-brand-500 text-white shadow-sm shadow-brand-500/20 hover:bg-brand-600 dark:hover:bg-brand-400",
	secondary:
		"border border-gray-200 bg-white text-gray-900 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10",
	ghost:
		"text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5",
	accent:
		"bg-accent-400 text-accent-950 shadow-sm shadow-accent-400/20 hover:bg-accent-300",
	destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
};

const sizeClass: Record<Size, string> = {
	sm: "h-8 px-3 text-xs gap-1.5",
	md: "h-9 px-4 text-sm gap-2",
	lg: "h-11 px-6 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			variant = "primary",
			size = "md",
			className = "",
			type = "button",
			...props
		},
		ref,
	) => (
		<button
			ref={ref}
			type={type}
			className={`inline-flex select-none items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:pointer-events-none disabled:opacity-50 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
			{...props}
		/>
	),
);

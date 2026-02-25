import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "ghost" | "subtle";
type Size = "sm" | "md";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
	label: string;
}

const variantClass: Record<Variant, string> = {
	ghost: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",
	subtle:
		"text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10",
};

const sizeClass: Record<Size, string> = {
	sm: "size-7 [&>svg]:size-4",
	md: "size-9 [&>svg]:size-5",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
	(
		{ variant = "ghost", size = "sm", label, className = "", ...props },
		ref,
	) => (
		<button
			ref={ref}
			type="button"
			aria-label={label}
			className={`inline-flex shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:pointer-events-none disabled:opacity-50 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
			{...props}
		/>
	),
);

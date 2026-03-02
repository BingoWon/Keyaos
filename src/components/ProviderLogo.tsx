import { useState } from "react";

interface ProviderLogoProps {
	src: string;
	name: string;
	size?: number;
}

export function ProviderLogo({ src, name, size = 20 }: ProviderLogoProps) {
	const [failed, setFailed] = useState(false);

	if (failed) {
		return (
			<span
				className="inline-flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 shrink-0"
				style={{ width: size, height: size }}
			>
				{name.charAt(0).toUpperCase()}
			</span>
		);
	}

	return (
		<img
			src={src}
			alt={name}
			className="rounded-full object-cover shrink-0"
			style={{ width: size, height: size }}
			onError={() => setFailed(true)}
		/>
	);
}

interface ProviderChipProps {
	src: string;
	name: string;
	size?: number;
	badge?: React.ReactNode;
	onClick?: () => void;
	className?: string;
}

export function ProviderChip({
	src,
	name,
	size = 18,
	badge,
	onClick,
	className = "",
}: ProviderChipProps) {
	const base =
		"inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 border border-gray-200/80 dark:bg-white/10 dark:border-white/10 transition-colors";
	const interactive = onClick
		? "cursor-pointer hover:border-brand-300 dark:hover:border-brand-500/30"
		: "";

	const Tag = onClick ? "button" : "span";

	return (
		<Tag
			{...(onClick ? { type: "button" as const, onClick } : {})}
			className={`${base} ${interactive} ${className}`}
		>
			<ProviderLogo src={src} name={name} size={size} />
			<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
				{name}
			</span>
			{badge}
		</Tag>
	);
}

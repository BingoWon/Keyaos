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

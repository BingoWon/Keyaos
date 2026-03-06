import { useState } from "react";
import { getOrgLogoUrl, getOrgName, getOrgSlug } from "../utils/orgMeta";

const FALLBACK_COLORS = [
	"bg-rose-500",
	"bg-orange-500",
	"bg-amber-500",
	"bg-emerald-500",
	"bg-teal-500",
	"bg-cyan-500",
	"bg-blue-500",
	"bg-indigo-500",
	"bg-violet-500",
	"bg-purple-500",
	"bg-fuchsia-500",
	"bg-pink-500",
];

function hashColor(slug: string): string {
	let h = 0;
	for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
	return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
}

interface OrgLogoProps {
	modelId: string;
	size?: number;
	className?: string;
}

export function OrgLogo({ modelId, size = 16, className = "" }: OrgLogoProps) {
	const slug = getOrgSlug(modelId);
	const name = getOrgName(slug);
	const [failed, setFailed] = useState(false);

	if (failed) {
		return (
			<span
				className={`inline-flex shrink-0 items-center justify-center rounded-sm text-[9px] font-bold text-white ${hashColor(slug)} ${className}`}
				style={{ width: size, height: size }}
				title={name}
			>
				{name[0].toUpperCase()}
			</span>
		);
	}

	return (
		<img
			src={getOrgLogoUrl(slug)}
			alt={name}
			title={name}
			width={size}
			height={size}
			loading="lazy"
			className={`shrink-0 rounded-sm object-contain ${className}`}
			onError={() => setFailed(true)}
		/>
	);
}

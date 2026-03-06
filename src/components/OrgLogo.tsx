import { useState } from "react";
import { getOrgLogoUrl, getOrgName, getOrgSlug } from "../utils/orgMeta";

const FALLBACK_LOGO = "/logos/hugging-face.png";

interface OrgLogoProps {
	modelId: string;
	size?: number;
	className?: string;
}

export function OrgLogo({ modelId, size = 16, className = "" }: OrgLogoProps) {
	const slug = getOrgSlug(modelId);
	const name = getOrgName(slug);
	const [failed, setFailed] = useState(false);

	return (
		<img
			src={failed ? FALLBACK_LOGO : getOrgLogoUrl(slug)}
			alt={name}
			title={name}
			width={size}
			height={size}
			loading="lazy"
			className={`shrink-0 rounded-sm object-contain ${className}`}
			onError={failed ? undefined : () => setFailed(true)}
		/>
	);
}

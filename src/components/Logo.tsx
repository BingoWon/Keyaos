import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

interface LogoProps {
	size?: "sm" | "md" | "lg";
	as?: "link" | "div";
	to?: string;
	className?: string;
}

const SIZES = {
	sm: { img: "size-6", text: "text-base" },
	md: { img: "size-7", text: "text-lg" },
	lg: { img: "size-8 rounded-xl", text: "text-xl" },
} as const;

export function Logo({
	size = "lg",
	as = "link",
	to = "/",
	className = "",
}: LogoProps) {
	const { t } = useTranslation();
	const s = SIZES[size];

	const content = (
		<>
			<img src="/logo.png" alt="Keyaos" className={s.img} />
			<span
				className={`${s.text} font-bold text-gray-900 dark:text-white tracking-tight`}
			>
				{t("brand.name")}
			</span>
		</>
	);

	const cls = `flex items-center gap-2.5 ${className}`;

	if (as === "link") {
		return (
			<Link to={to} className={cls}>
				{content}
			</Link>
		);
	}

	return <div className={cls}>{content}</div>;
}

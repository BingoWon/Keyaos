import { useTranslation } from "react-i18next";

interface LogoProps {
	size?: "sm" | "lg";
}

export function Logo({ size = "sm" }: LogoProps) {
	const { t } = useTranslation();
	const imgSize = size === "lg" ? "h-12 w-12" : "h-8 w-8";
	const textSize = size === "lg" ? "text-3xl" : "text-xl";

	return (
		<div className="flex items-center gap-x-2">
			<img src="/logo.png" alt="Keyaos" className={`${imgSize} rounded-xl`} />
			<span
				className={`${textSize} font-bold text-gray-900 dark:text-white tracking-tight`}
			>
				{t("brand.name")}
			</span>
		</div>
	);
}

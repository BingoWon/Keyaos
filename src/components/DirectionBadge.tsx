import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

export function DirectionBadge({
	direction,
}: {
	direction: "spent" | "earned" | "self";
}) {
	const { t } = useTranslation();

	if (direction === "earned") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
				<ArrowDownTrayIcon className="size-3" />
				{t("logs.earned")}
			</span>
		);
	}
	if (direction === "spent") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
				<ArrowUpTrayIcon className="size-3" />
				{t("logs.spent")}
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
			<ArrowPathIcon className="size-3" />
			{t("logs.self_use")}
		</span>
	);
}

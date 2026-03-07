import { ArrowPathIcon, CheckIcon } from "@heroicons/react/20/solid";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TOKENS } from "../utils/colors";
import { formatTimestamp } from "../utils/format";

interface RefreshControlProps {
	loading: boolean;
	lastUpdated: Date | null;
	onRefresh: () => void;
}

/**
 * Shared refresh control with loading spinner and brief success indicator.
 * Only shows the check icon after user-initiated refreshes, not auto-refreshes.
 * Uses a neutral ghost style to avoid conflict with primary action buttons.
 */
export function RefreshControl({
	loading,
	lastUpdated,
	onRefresh,
}: RefreshControlProps) {
	const { t } = useTranslation();
	const [showCheck, setShowCheck] = useState(false);
	const manualRef = useRef(false);
	const prevLoadingRef = useRef(false);

	useEffect(() => {
		if (manualRef.current && prevLoadingRef.current && !loading) {
			manualRef.current = false;
			setShowCheck(true);
			const timer = setTimeout(() => setShowCheck(false), 1500);
			return () => clearTimeout(timer);
		}
		prevLoadingRef.current = loading;
	}, [loading]);

	const handleClick = () => {
		manualRef.current = true;
		setShowCheck(false);
		onRefresh();
	};

	return (
		<>
			{lastUpdated && (
				<span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0 mb-1">
					{t("common_updated_at", { time: formatTimestamp(lastUpdated) })}
				</span>
			)}
			<button
				type="button"
				onClick={handleClick}
				className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-xs transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
			>
				{showCheck ? (
					<CheckIcon className={`-ml-0.5 size-4 ${TOKENS.green.text}`} />
				) : (
					<ArrowPathIcon
						className={`-ml-0.5 size-4 ${loading ? "animate-spin" : ""}`}
					/>
				)}
				{t("common_refresh")}
			</button>
		</>
	);
}


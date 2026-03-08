import { ArrowPathIcon, CheckIcon } from "@heroicons/react/20/solid";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TOKENS } from "../utils/colors";
import { formatTimestamp } from "../utils/format";
import { Button } from "./ui";

interface RefreshControlProps {
	loading: boolean;
	lastUpdated: Date | null;
	onRefresh: () => void;
}

/**
 * Shared refresh control with loading spinner and brief success indicator.
 * Only shows the check icon after user-initiated refreshes, not auto-refreshes.
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
				<span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
					{t("common_updated_at", { time: formatTimestamp(lastUpdated) })}
				</span>
			)}
			<Button onClick={handleClick} className="shrink-0">
				{showCheck ? (
					<CheckIcon className={`-ml-0.5 size-5 ${TOKENS.green.text}`} />
				) : (
					<ArrowPathIcon
						className={`-ml-0.5 size-5 ${loading ? "animate-spin" : ""}`}
					/>
				)}
				{t("common_refresh")}
			</Button>
		</>
	);
}

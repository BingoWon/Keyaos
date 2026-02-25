import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	getConsent,
	loadAllAnalytics,
	setConsent,
} from "../lib/analytics";

const hasAnalytics = !!(
	import.meta.env.VITE_GA_ID || import.meta.env.VITE_CRISP_WEBSITE_ID
);

export function CookieConsent() {
	const { t } = useTranslation();
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (hasAnalytics && getConsent() === null) {
			const timer = setTimeout(() => setVisible(true), 800);
			return () => clearTimeout(timer);
		}
	}, []);

	const accept = useCallback(() => {
		setConsent("accepted");
		loadAllAnalytics();
		setVisible(false);
	}, []);

	const decline = useCallback(() => {
		setConsent("declined");
		setVisible(false);
	}, []);

	if (!visible) return null;

	return (
		<div className="fixed inset-x-0 bottom-0 z-[100] flex justify-center p-4 sm:p-6">
			<div className="flex w-fit max-w-[calc(100%-2rem)] flex-col gap-4 rounded-2xl border border-gray-200 bg-white/90 px-6 py-4 shadow-xl shadow-black/5 backdrop-blur-xl sm:max-w-[calc(100%-3rem)] sm:flex-row sm:items-center sm:gap-5 dark:border-white/10 dark:bg-gray-900/90 dark:shadow-black/20">
				<p className="flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
					{t("cookie.message")}
				</p>
				<div className="flex shrink-0 gap-2">
					<button
						type="button"
						onClick={decline}
						className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
					>
						{t("cookie.decline")}
					</button>
					<button
						type="button"
						onClick={accept}
						className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 dark:hover:bg-brand-400"
					>
						{t("cookie.accept")}
					</button>
				</div>
			</div>
		</div>
	);
}

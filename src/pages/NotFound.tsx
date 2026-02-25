import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function NotFound() {
	const { t } = useTranslation();

	return (
		<main className="grid min-h-screen place-items-center bg-white px-6 py-24 sm:py-32 lg:px-8 dark:bg-gray-900">
			<div className="text-center">
				<p className="text-base font-semibold text-brand-600 dark:text-brand-400">
					404
				</p>
				<h1 className="mt-4 text-5xl font-semibold tracking-tight text-balance text-gray-900 sm:text-7xl dark:text-white">
					{t("common.page_not_found", "Page not found")}
				</h1>
				<p className="mt-6 text-lg font-medium text-pretty text-gray-500 sm:text-xl/8 dark:text-gray-400">
					{t(
						"common.page_not_found_desc",
						"Sorry, we couldn’t find the page you’re looking for.",
					)}
				</p>
				<div className="mt-10 flex items-center justify-center gap-x-6">
					<Link
						to="/"
						className="rounded-md bg-brand-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
					>
						{t("common.go_home", "Go back home")}
					</Link>
				</div>
			</div>
		</main>
	);
}

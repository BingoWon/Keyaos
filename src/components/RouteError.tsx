import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { TOKENS } from "../utils/colors";

export function RouteError() {
	const error = useRouteError();
	const isNotFound = isRouteErrorResponse(error) && error.status === 404;

	if (isNotFound) {
		return (
			<main className="grid min-h-screen place-items-center bg-white px-6 py-24 dark:bg-gray-900">
				<div className="text-center">
					<p className="text-base font-semibold text-brand-600 dark:text-brand-400">
						404
					</p>
					<h1 className="mt-4 text-5xl font-semibold tracking-tight text-gray-900 dark:text-white">
						Page not found
					</h1>
					<div className="mt-10">
						<Link
							to="/"
							className="rounded-lg bg-brand-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-600"
						>
							Go back home
						</Link>
					</div>
				</div>
			</main>
		);
	}

	const message =
		error instanceof Error ? error.message : "An unexpected error occurred";

	return (
		<main className="grid min-h-screen place-items-center bg-white px-6 py-24 dark:bg-gray-900">
			<div className="text-center max-w-lg">
				<div
					className={`mx-auto flex size-14 items-center justify-center rounded-full ${TOKENS.red.soft}`}
				>
					<svg
						className="size-6"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={1.5}
						stroke="currentColor"
						role="img"
						aria-label="Error"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
						/>
					</svg>
				</div>
				<h1 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-white">
					Something went wrong
				</h1>
				<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
					{message}
				</p>
				<div className="mt-8 flex items-center justify-center gap-4">
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-600"
					>
						<ArrowPathIcon className="size-4" />
						Reload page
					</button>
					<Link
						to="/dashboard"
						className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
					>
						Go to Dashboard
					</Link>
				</div>
			</div>
		</main>
	);
}

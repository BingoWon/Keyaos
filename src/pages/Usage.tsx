import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { Trans, useTranslation } from "react-i18next";
import { PromoBanner } from "../components/ui";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import { formatSignedUSD } from "../utils/format";

interface UsageEntry {
	id: string;
	direction: "spent" | "earned" | "self";
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	netCredits: number;
	createdAt: number;
}

function DirectionBadge({ direction }: { direction: UsageEntry["direction"] }) {
	const { t } = useTranslation();

	if (direction === "earned") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
				<ArrowDownTrayIcon className="size-3" />
				{t("usage.earned")}
			</span>
		);
	}
	if (direction === "spent") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
				<ArrowUpTrayIcon className="size-3" />
				{t("usage.spent")}
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
			<ArrowPathIcon className="size-3" />
			{t("usage.self_use")}
		</span>
	);
}

export function Usage() {
	const { t } = useTranslation();
	const formatDateTime = useFormatDateTime();
	const {
		data: entries,
		loading,
		error,
	} = useFetch<UsageEntry[]>("/api/usage?limit=100");

	if (error) {
		return (
			<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-900/20 dark:text-red-400">
				Failed to load usage: {error.message}
			</div>
		);
	}

	return (
		<div>
			<h3 className="text-base font-semibold text-gray-900 dark:text-white">
				{t("usage.title")}
			</h3>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				{t("usage.subtitle")}
			</p>

			<PromoBanner
				title={t("usage.promo_title")}
				description={
					<Trans
						i18nKey="usage.promo_desc"
						components={{
							GithubLink: (
								<a
									href="https://github.com/BingoWon/Keyaos"
									target="_blank"
									rel="noopener noreferrer"
									className="font-semibold text-white hover:text-white/90 underline underline-offset-4 decoration-white/40 hover:decoration-white/80 transition-colors"
								/>
							),
						}}
					/>
				}
			/>

			{loading ? (
				<div className="mt-5">
					<PageLoader />
				</div>
			) : !entries?.length ? (
				<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{t("usage.no_data")}
				</p>
			) : (
				<div className="mt-5 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
					<table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
						<thead className="bg-gray-50 dark:bg-white/5">
							<tr>
								<th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">
									{t("usage.time")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("usage.direction")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("usage.model")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("usage.provider")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
									{t("usage.input_tokens")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
									{t("usage.output_tokens")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white sm:pr-6">
									{t("usage.credits")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-200 dark:divide-white/5 bg-white dark:bg-transparent">
							{entries.map((tx) => (
								<tr key={tx.id}>
									<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-500 dark:text-gray-400 sm:pl-6">
										{formatDateTime(tx.createdAt)}
									</td>
									<td className="whitespace-nowrap px-3 py-4">
										<DirectionBadge direction={tx.direction} />
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900 dark:text-white">
										{tx.model}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
										{tx.provider}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-500 dark:text-gray-400">
										{tx.inputTokens.toLocaleString()}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-500 dark:text-gray-400">
										{tx.outputTokens.toLocaleString()}
									</td>
									<td
										className={`whitespace-nowrap px-3 py-4 text-sm text-right font-medium sm:pr-6 ${tx.netCredits > 0
											? "text-green-600 dark:text-green-400"
											: tx.netCredits < 0
												? "text-red-600 dark:text-red-400"
												: "text-gray-400 dark:text-gray-500"
											}`}
									>
										{formatSignedUSD(tx.netCredits)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

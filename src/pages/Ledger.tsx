import { useTranslation } from "react-i18next";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";

interface LedgerEntry {
	id: string;
	credentialId: string;
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	creditsUsed: number;
	createdAt: number;
}

export function Ledger() {
	const { t } = useTranslation();
	const formatDateTime = useFormatDateTime();
	const {
		data: entries,
		loading,
		error,
	} = useFetch<LedgerEntry[]>("/api/ledger?limit=100");

	if (error) {
		return (
			<div className="p-4 text-sm text-red-500 bg-red-50 rounded-lg dark:bg-red-900/20 dark:text-red-400">
				Failed to load ledger: {error.message}
			</div>
		);
	}

	return (
		<div>
			<h3 className="text-base font-semibold text-gray-900 dark:text-white">
				{t("ledger.title")}
			</h3>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				{t("ledger.subtitle")}
			</p>

			{loading ? (
				<div className="mt-5">
					<PageLoader />
				</div>
			) : !entries?.length ? (
				<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{t("ledger.no_data")}
				</p>
			) : (
				<div className="mt-5 overflow-hidden shadow ring-1 ring-black/5 rounded-lg dark:ring-white/10">
					<table className="min-w-full divide-y divide-gray-300 dark:divide-white/10">
						<thead className="bg-gray-50 dark:bg-white/5">
							<tr>
								<th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">
									{t("ledger.time")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("ledger.model")}
								</th>
								<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
									{t("ledger.provider")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
									{t("ledger.tokens")}
								</th>
								<th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white sm:pr-6">
									{t("ledger.credits_used")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-200 dark:divide-white/5 bg-white dark:bg-transparent">
							{entries.map((tx) => (
								<tr key={tx.id}>
									<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-500 dark:text-gray-400 sm:pl-6">
										{formatDateTime(tx.createdAt)}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900 dark:text-white">
										{tx.model}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
										{tx.provider}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-500 dark:text-gray-400">
										{(tx.inputTokens + tx.outputTokens).toLocaleString()}
									</td>
									<td className="whitespace-nowrap px-3 py-4 text-sm text-right font-medium text-gray-900 dark:text-white sm:pr-6">
										{tx.creditsUsed > 0 ? tx.creditsUsed.toFixed(4) : "Free"}
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

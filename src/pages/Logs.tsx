import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { DirectionBadge } from "../components/DirectionBadge";
import { OrgLogo } from "../components/OrgLogo";
import { Pagination } from "../components/Pagination";
import { PromoBanner } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import type { LogEntry } from "../types/log";
import { TOKENS } from "../utils/colors";
import { formatSignedUSD } from "../utils/format";

import { RefreshControl } from "../components/RefreshControl";
import { useAutoRefresh } from "../hooks/useAutoRefresh";

const DEFAULT_PAGE_SIZE = 20;

export function Logs() {
	const { t } = useTranslation();
	const formatDateTime = useFormatDateTime();
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

	const {
		data: result,
		loading,
		error,
		refetch,
	} = useFetch<{ items: LogEntry[]; total: number }>(
		`/api/logs?page=${page}&limit=${pageSize}`,
	);

	const lastUpdated = useAutoRefresh(refetch, result);

	const items = result?.items ?? [];
	const total = result?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	if (error) {
		return (
			<div className={`rounded-xl border p-4 text-sm ${TOKENS.red.outline}`}>
				Failed to load logs: {error.message}
			</div>
		);
	}

	return (
		<div>
			<div className="sm:flex sm:items-center sm:justify-between">
				<div>
					<h1 className="text-xl font-semibold text-gray-900 dark:text-white">
						{t("logs.title")}
					</h1>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("logs.subtitle")}
					</p>
				</div>
				<div className="mt-4 flex sm:mt-0 sm:ml-4">
					<RefreshControl
						loading={loading}
						lastUpdated={lastUpdated}
						onRefresh={refetch}
					/>
				</div>
			</div>

			<PromoBanner
				id="logs"
				title={t("logs.promo_title")}
				description={
					<Trans
						i18nKey="logs.promo_desc"
						components={{
							GithubLink: (
								// biome-ignore lint/a11y/useAnchorContent: Trans injects children at runtime
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

			{loading && !items.length ? (
				<div className="mt-5 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
					<div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
						{Array.from({ length: 8 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							<div key={i} className="flex items-center gap-4 px-5 py-2.5">
								<div className="h-4 w-28 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
								<div className="h-5 w-16 rounded-full bg-gray-100 dark:bg-white/5 animate-pulse" />
								<div className="h-4 w-32 rounded bg-gray-100 dark:bg-white/5 animate-pulse flex-1" />
								<div className="h-4 w-14 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
							</div>
						))}
					</div>
				</div>
			) : !items.length ? (
				<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{t("logs.no_data")}
				</p>
			) : (
				<>
					<div className="mt-5 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
						<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
							<thead>
								<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
									<th className="py-2.5 pl-4 pr-2 sm:pl-5">{t("logs.time")}</th>
									<th className="px-2 py-2.5">{t("logs.direction")}</th>
									<th className="px-2 py-2.5">{t("logs.model")}</th>
									<th className="px-2 py-2.5">{t("logs.provider")}</th>
									<th className="px-2 py-2.5 text-right">
										{t("logs.input_tokens")}
									</th>
									<th className="px-2 py-2.5 text-right">
										{t("logs.output_tokens")}
									</th>
									<th className="py-2.5 pl-2 pr-4 text-right sm:pr-5">
										{t("logs.credits")}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
								{items.map((tx) => (
									<tr
										key={tx.id}
										className="even:bg-gray-50/50 dark:even:bg-white/[0.015]"
									>
										<td className="whitespace-nowrap py-2.5 pl-4 pr-2 text-sm text-gray-500 dark:text-gray-400 sm:pl-5">
											{formatDateTime(tx.createdAt)}
										</td>
										<td className="whitespace-nowrap px-2 py-2.5">
											<DirectionBadge direction={tx.direction} />
										</td>
										<td className="whitespace-nowrap px-2 py-2.5 text-sm font-medium text-gray-900 dark:text-white">
											<span className="inline-flex items-center gap-2">
												<OrgLogo modelId={tx.model_id} size={16} />
												{tx.model_id}
											</span>
										</td>
										<td className="whitespace-nowrap px-2 py-2.5 text-sm text-gray-500 dark:text-gray-400">
											{tx.provider_id}
										</td>
										<td className="whitespace-nowrap px-2 py-2.5 text-sm text-right text-gray-500 dark:text-gray-400">
											{tx.inputTokens.toLocaleString()}
										</td>
										<td className="whitespace-nowrap px-2 py-2.5 text-sm text-right text-gray-500 dark:text-gray-400">
											{tx.outputTokens.toLocaleString()}
										</td>
										<td
											className={`whitespace-nowrap py-2.5 pl-2 pr-4 text-sm text-right font-medium sm:pr-5 ${tx.netCredits > 0
												? TOKENS.green.text
												: tx.netCredits < 0
													? TOKENS.red.text
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
					<div className="mt-3 flex items-center justify-between">
						<span className="text-xs text-gray-500 dark:text-gray-400">
							{total.toLocaleString()} {t("logs.title").toLowerCase()}
						</span>
						<Pagination
							page={page}
							totalPages={totalPages}
							onChange={setPage}
							pageSize={pageSize}
							onPageSizeChange={(s) => {
								setPageSize(s);
								setPage(1);
							}}
						/>
					</div>
				</>
			)}
		</div>
	);
}

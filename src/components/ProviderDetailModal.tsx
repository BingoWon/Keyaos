import { useTranslation } from "react-i18next";
import { formatContext } from "../utils/format";
import type { ProviderGroup } from "../utils/providers";
import { CopyButton } from "./CopyButton";
import { Modal } from "./Modal";
import { ModalityCell } from "./Modalities";
import { PriceChart } from "./PriceChart";
import { DualPrice } from "./ui";

export function ProviderDetailModal({
	group,
	onClose,
}: {
	group: ProviderGroup;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Modal open onClose={onClose} title={group.provider.name} size="4xl">
			<PriceChart
				dimension="provider"
				value={group.provider.id}
				title={t("chart.multiplier_trend")}
				className="border-0 shadow-none -mx-1"
			/>
			<table className="mt-4 min-w-full divide-y divide-gray-100 dark:divide-white/5">
				<thead>
					<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
						<th className="py-2 pr-2">{t("models.model")}</th>
						<th className="px-2">In</th>
						<th className="px-2">Out</th>
						<th className="px-2 text-right">Input /1M</th>
						<th className="px-2 text-right">Output /1M</th>
						<th className="py-2 pl-2 text-right">Context</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
					{group.models.map((m) => (
						<tr key={m.id}>
							<td className="py-2.5 pr-2 text-sm text-gray-700 dark:text-gray-300">
								<span className="inline-flex items-center gap-1">
									<code className="text-xs font-mono text-gray-500 dark:text-gray-400">
										{m.id}
									</code>
									<CopyButton text={m.id} />
								</span>
							</td>
							<td className="px-2 py-2.5">
								<ModalityCell modalities={m.inputModalities} />
							</td>
							<td className="px-2 py-2.5">
								<ModalityCell modalities={m.outputModalities} />
							</td>
							<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								<DualPrice
									original={m.inputPrice}
									platform={m.platformInputPrice}
								/>
							</td>
							<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								<DualPrice
									original={m.outputPrice}
									platform={m.platformOutputPrice}
								/>
							</td>
							<td className="py-2.5 pl-2 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								{m.contextLength > 0 ? formatContext(m.contextLength) : "—"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Modal>
	);
}

import type { ProviderMeta } from "../types/provider";
import { formatContext } from "../utils/format";
import type { ModelGroup } from "../utils/models";
import { CopyButton } from "./CopyButton";
import { Modal } from "./Modal";
import { PriceChart } from "./PriceChart";
import { ProviderLogo } from "./ProviderLogo";
import { DualPrice } from "./ui";

function ProviderCell({ id, meta }: { id: string; meta?: ProviderMeta }) {
	return (
		<td className="py-2.5 pr-2 text-sm text-gray-700 dark:text-gray-300">
			<span className="inline-flex items-center gap-1.5">
				{meta && <ProviderLogo src={meta.logoUrl} name={meta.name} size={16} />}
				{meta?.name ?? id}
				<CopyButton text={id} />
			</span>
		</td>
	);
}

export function ModelDetailModal({
	group,
	providerMap,
	onClose,
}: {
	group: ModelGroup;
	providerMap: Map<string, ProviderMeta>;
	onClose: () => void;
}) {
	return (
		<Modal open onClose={onClose} title={group.displayName} size="3xl">
			<PriceChart
				dimension="model"
				value={group.id}
				className="border-0 shadow-none -mx-1"
			/>
			<table className="mt-4 min-w-full divide-y divide-gray-100 dark:divide-white/5">
				<thead>
					<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
						<th className="py-2 pr-2">Provider</th>
						<th className="px-2 text-right">Input /1M</th>
						<th className="px-2 text-right">Output /1M</th>
						<th className="py-2 pl-2 text-right">Context</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
					{group.providers.map((p, i) => (
						<tr
							key={p.provider}
							className={
								i === 0 ? "bg-brand-50/50 dark:bg-brand-500/[0.04]" : undefined
							}
						>
							<ProviderCell
								id={p.provider}
								meta={providerMap.get(p.provider)}
							/>
							<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								<DualPrice
									original={p.inputPrice}
									platform={p.platformInputPrice}
								/>
							</td>
							<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								<DualPrice
									original={p.outputPrice}
									platform={p.platformOutputPrice}
								/>
							</td>
							<td className="py-2.5 pl-2 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
								{formatContext(p.contextLength)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Modal>
	);
}

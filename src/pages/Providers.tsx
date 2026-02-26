import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageLoader } from "../components/PageLoader";
import { PriceChart } from "../components/PriceChart";
import { ProviderLogo } from "../components/ProviderLogo";
import { Badge } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import type { ProviderMeta } from "../types/provider";

interface ModelEntry {
	id: string;
	owned_by: string;
	name?: string;
	input_price?: number;
	output_price?: number;
}

interface ProviderGroup {
	provider: ProviderMeta;
	models: { id: string; name: string; inputPrice: number; outputPrice: number }[];
}

function formatPrice(price: number) {
	if (price === 0) return "Free";
	const usd = price / 100;
	if (usd >= 0.01) return `$${usd.toFixed(2)}`;
	return `$${Number(usd.toPrecision(3))}`;
}

function ProviderCard({ group }: { group: ProviderGroup }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	const cheapest = group.models.reduce(
		(min, m) => (m.inputPrice < min ? m.inputPrice : min),
		Number.POSITIVE_INFINITY,
	);

	return (
		<div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden transition-shadow hover:shadow-sm">
			<div
				role="button"
				tabIndex={0}
				onClick={() => setOpen(!open)}
				onKeyDown={(e) => e.key === "Enter" && setOpen(!open)}
				className="w-full px-4 py-3.5 sm:px-5 flex items-center gap-3 hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer select-none"
			>
				<ChevronRightIcon
					className={`size-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
				/>
				<ProviderLogo
					src={group.provider.logoUrl}
					name={group.provider.name}
					size={24}
				/>
				<div className="min-w-0 flex-1">
					<h4 className="text-sm font-semibold text-gray-900 dark:text-white">
						{group.provider.name}
					</h4>
					<span className="text-xs text-gray-500 dark:text-gray-400">
						{group.provider.id}
					</span>
				</div>
				<div className="shrink-0 flex items-center gap-2">
					<Badge variant="brand">
						{group.models.length} {t("providers.models_count")}
					</Badge>
					{cheapest < Number.POSITIVE_INFINITY && (
						<Badge variant="success">{formatPrice(cheapest)} min</Badge>
					)}
					{group.provider.supportsAutoCredits && (
						<Badge variant="accent">{t("providers.auto")}</Badge>
					)}
				</div>
			</div>

			{open && (
				<div className="border-t border-gray-100 dark:border-white/5">
					<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
						<thead>
							<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500">
								<th className="py-2.5 pl-4 pr-2 sm:pl-5">
									{t("models.model")}
								</th>
								<th className="px-2 text-right">Input /1M</th>
								<th className="py-2.5 pl-2 pr-4 sm:pr-5 text-right">
									Output /1M
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
							{group.models.map((m) => (
								<tr key={m.id}>
									<td className="py-2.5 pl-4 pr-2 sm:pl-5 text-sm text-gray-700 dark:text-gray-300">
										<div>
											<span className="font-medium">{m.name || m.id}</span>
											{m.name && (
												<code className="ml-1.5 text-xs text-gray-400">
													{m.id}
												</code>
											)}
										</div>
									</td>
									<td className="px-2 py-2.5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
										{formatPrice(m.inputPrice)}
									</td>
									<td className="py-2.5 pl-2 pr-4 sm:pr-5 text-sm font-mono text-right text-gray-600 dark:text-gray-400">
										{formatPrice(m.outputPrice)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<PriceChart
						dimension="provider"
						value={group.provider.id}
						className="m-3 border-0 shadow-none"
					/>
				</div>
			)}
		</div>
	);
}

export function Providers() {
	const { t } = useTranslation();
	const { data: models, loading: modelsLoading } =
		useFetch<ModelEntry[]>("/v1/models");
	const { data: providersData, loading: providersLoading } =
		useFetch<ProviderMeta[]>("/api/providers");

	const groups = useMemo(() => {
		if (!models || !providersData) return [];

		const providerMap = new Map<string, ProviderMeta>();
		for (const p of providersData) providerMap.set(p.id, p);

		const byProvider = new Map<string, ProviderGroup>();
		for (const m of models) {
			const meta = providerMap.get(m.owned_by);
			if (!meta) continue;

			let group = byProvider.get(m.owned_by);
			if (!group) {
				group = { provider: meta, models: [] };
				byProvider.set(m.owned_by, group);
			}
			group.models.push({
				id: m.id,
				name: m.name ?? m.id,
				inputPrice: m.input_price ?? 0,
				outputPrice: m.output_price ?? 0,
			});
		}

		for (const g of byProvider.values()) {
			g.models.sort((a, b) => a.inputPrice - b.inputPrice);
		}

		return [...byProvider.values()].sort(
			(a, b) => b.models.length - a.models.length,
		);
	}, [models, providersData]);

	const loading = modelsLoading || providersLoading;

	return (
		<div>
			<div>
				<h3 className="text-base font-semibold text-gray-900 dark:text-white">
					{t("providers.title")}
				</h3>
				<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
					{t("providers.subtitle")}
				</p>
			</div>

			{loading ? (
				<div className="mt-5">
					<PageLoader />
				</div>
			) : groups.length === 0 ? (
				<p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
					{t("providers.no_data")}
				</p>
			) : (
				<div className="mt-5 grid gap-3">
					{groups.map((g) => (
						<ProviderCard key={g.provider.id} group={g} />
					))}
				</div>
			)}
		</div>
	);
}

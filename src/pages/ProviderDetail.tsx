import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CopyButton } from "../components/CopyButton";
import { ModalityCell } from "../components/Modalities";
import { OrgLogo } from "../components/OrgLogo";
import { PriceChart } from "../components/PriceChart";
import { ProviderLogo } from "../components/ProviderLogo";
import { Badge, Breadcrumb, DualPrice } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import type { ModelEntry } from "../types/model";
import type { ProviderMeta } from "../types/provider";
import { formatContext } from "../utils/format";
import { aggregateProviders } from "../utils/providers";

export function ProviderDetail() {
	const { providerId } = useParams<{ providerId: string }>();
	const { t } = useTranslation();
	const navigate = useNavigate();

	const { data: models, loading: modelsLoading } = useFetch<ModelEntry[]>(
		"/api/models",
		{ requireAuth: false },
	);
	const { data: providersData, loading: providersLoading } = useFetch<
		ProviderMeta[]
	>("/api/providers", { requireAuth: false });

	const group = useMemo(() => {
		if (!models || !providersData) return null;
		return (
			aggregateProviders(models, providersData).find(
				(g) => g.provider.id === providerId,
			) ?? null
		);
	}, [models, providersData, providerId]);

	useEffect(() => {
		if (group) document.title = `${group.provider.name} — Keyaos`;
		return () => {
			document.title = "Keyaos";
		};
	}, [group]);

	const loading =
		(!models || !providersData) && (modelsLoading || providersLoading);

	if (loading) {
		return (
			<div className="animate-pulse space-y-8">
				<div>
					<div className="h-8 w-48 rounded bg-gray-200 dark:bg-white/10" />
					<div className="mt-2 h-4 w-32 rounded bg-gray-100 dark:bg-white/5" />
				</div>
				<div className="h-64 rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5" />
				<div className="h-48 rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5" />
			</div>
		);
	}

	if (!group) {
		return (
			<div className="py-20 text-center">
				<p className="text-lg font-medium text-gray-900 dark:text-white">
					{t("providers.not_found", "Provider not found")}
				</p>
				<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
					<code className="font-mono">{providerId}</code>
				</p>
				<Link
					to="/providers"
					className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
				>
					&larr; {t("providers.back_to_list", "Back to providers")}
				</Link>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			{/* Breadcrumb */}
			<Breadcrumb
				items={[
					{ label: t("nav.providers", "Providers"), to: "/providers" },
					{ label: group.provider.name },
				]}
			/>

			{/* Header */}
			<div>
				<h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900 dark:text-white">
					<ProviderLogo
						src={group.provider.logoUrl}
						name={group.provider.name}
						size={28}
					/>
					{group.provider.name}
				</h1>
				<div className="mt-1.5 flex items-center gap-2">
					<code className="text-sm font-mono text-gray-500 dark:text-gray-400">
						{group.provider.id}
					</code>
					<CopyButton text={group.provider.id} />
				</div>
				<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
					<span>
						{group.models.length}{" "}
						{group.models.length === 1 ? "model" : "models"}
					</span>
					{group.bestMultiplier != null && group.bestMultiplier < 1 && (
						<Badge variant="success">
							×{group.bestMultiplier.toFixed(3)} multiplier
						</Badge>
					)}
				</div>
			</div>

			{/* Price Chart */}
			<PriceChart dimension="provider" value={group.provider.id} />

			{/* Models Table */}
			<div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
				<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
					<thead>
						<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
							<th className="py-2.5 pl-4 pr-2 sm:pl-5">{t("models.model")}</th>
							<th className="px-2">In</th>
							<th className="px-2">Out</th>
							<th className="px-2 text-right">Input /1M</th>
							<th className="px-2 text-right">Output /1M</th>
							<th className="py-2.5 pl-2 pr-4 text-right sm:pr-5">Context</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
						{group.models.map((m) => {
							const [org, ...rest] = m.id.split("/");
							const modelPath = `/${org}/${rest.join("/")}`;
							return (
								<tr
									key={m.id}
									onClick={(e) => {
										if ((e.target as HTMLElement).closest("a, button")) return;
										navigate(modelPath);
									}}
									className="even:bg-gray-50/50 hover:bg-gray-100/60 dark:even:bg-white/[0.015] dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
								>
									<td className="py-2.5 pl-4 pr-2 sm:pl-5">
										<Link
											to={modelPath}
											className="inline-flex items-center gap-2 text-sm text-gray-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400 transition-colors whitespace-nowrap"
										>
											<OrgLogo modelId={m.id} />
											<span className="font-medium">{m.name}</span>
										</Link>
										<div className="mt-0.5 flex items-center gap-1">
											<code className="text-[11px] font-mono text-gray-400 dark:text-gray-500">
												{m.id}
											</code>
											<CopyButton text={m.id} />
										</div>
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
									<td className="py-2.5 pl-2 pr-4 text-sm font-mono text-right text-gray-600 dark:text-gray-400 sm:pr-5">
										{m.contextLength > 0 ? formatContext(m.contextLength) : "—"}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

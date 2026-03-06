import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { CopyButton } from "../components/CopyButton";
import { ModalityBadges } from "../components/Modalities";
import { PriceChart } from "../components/PriceChart";
import { ProviderLogo } from "../components/ProviderLogo";
import { Badge, DualPrice } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import type { ModelEntry } from "../types/model";
import type { ProviderMeta } from "../types/provider";
import { formatContext, formatRelativeTime } from "../utils/format";
import { aggregateModels } from "../utils/models";

export function ModelDetail() {
	const { org, model } = useParams<{ org: string; model: string }>();
	const { t, i18n } = useTranslation();
	const modelId = `${org}/${model}`;

	const { data: rawModels, loading } = useFetch<ModelEntry[]>("/api/models", {
		requireAuth: false,
	});
	const { data: providersData } = useFetch<ProviderMeta[]>("/api/providers", {
		requireAuth: false,
	});

	const group = useMemo(() => {
		if (!rawModels) return null;
		return aggregateModels(rawModels).find((g) => g.id === modelId) ?? null;
	}, [rawModels, modelId]);

	const providerMap = useMemo(
		() => new Map((providersData ?? []).map((p) => [p.id, p])),
		[providersData],
	);

	useEffect(() => {
		if (group) document.title = `${group.displayName} — Keyaos`;
		return () => {
			document.title = "Keyaos";
		};
	}, [group]);

	if (loading) {
		return (
			<div className="animate-pulse space-y-6">
				<div>
					<div className="h-8 w-64 rounded bg-gray-200 dark:bg-white/10" />
					<div className="mt-2 h-4 w-48 rounded bg-gray-100 dark:bg-white/5" />
					<div className="mt-3 flex gap-3">
						<div className="h-5 w-24 rounded bg-gray-100 dark:bg-white/5" />
						<div className="h-5 w-20 rounded bg-gray-100 dark:bg-white/5" />
						<div className="h-5 w-28 rounded bg-gray-100 dark:bg-white/5" />
					</div>
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
					{t("models.not_found", "Model not found")}
				</p>
				<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
					<code className="font-mono">{modelId}</code>
				</p>
				<Link
					to="/models"
					className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
				>
					← {t("models.back_to_list", "Back to models")}
				</Link>
			</div>
		);
	}

	const maxCtx = Math.max(...group.providers.map((p) => p.contextLength));

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
						{group.displayName}
					</h1>
					<div className="mt-1 flex items-center gap-2">
						<code className="text-sm font-mono text-gray-500 dark:text-gray-400">
							{group.id}
						</code>
						<CopyButton text={group.id} />
					</div>
					<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
						{group.createdAt > 0 && (
							<span>{formatRelativeTime(group.createdAt, i18n.language)}</span>
						)}
						{maxCtx > 0 && <span>{formatContext(maxCtx)} context</span>}
						<span>
							{group.providers.length}{" "}
							{group.providers.length === 1 ? "provider" : "providers"}
						</span>
						<ModalityBadges
							input={group.inputModalities}
							output={group.outputModalities}
						/>
					</div>
				</div>
				<Link
					to={`/chat?model=${encodeURIComponent(group.id)}`}
					className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-600"
				>
					<ChatBubbleLeftRightIcon className="size-4" />
					Chat
				</Link>
			</div>

			{/* Price Chart */}
			<PriceChart dimension="model" value={group.id} />

			{/* Providers Table */}
			<div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
				<table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
					<thead>
						<tr className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
							<th className="py-2.5 pl-4 pr-2 sm:pl-5">
								{t("models.provider", "Provider")}
							</th>
							<th className="px-2 py-2.5 text-right">
								{t("models.input_price", "Input /1M")}
							</th>
							<th className="px-2 py-2.5 text-right">
								{t("models.output_price", "Output /1M")}
							</th>
							<th className="py-2.5 pl-2 pr-4 text-right sm:pr-5">
								{t("models.context", "Context")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
						{group.providers.map((p, i) => {
							const meta = providerMap.get(p.provider_id);
							return (
								<tr
									key={p.provider_id}
									className={
										i === 0
											? "bg-brand-50/50 dark:bg-brand-500/[0.04]"
											: "even:bg-gray-50/50 dark:even:bg-white/[0.015]"
									}
								>
									<td className="py-2.5 pl-4 pr-2 text-sm text-gray-700 dark:text-gray-300 sm:pl-5">
										<span className="inline-flex items-center gap-1.5">
											{meta && (
												<ProviderLogo
													src={meta.logoUrl}
													name={meta.name}
													size={16}
												/>
											)}
											<span>{meta?.name ?? p.provider_id}</span>
											<CopyButton text={p.provider_id} />
											{i === 0 && (
												<Badge variant="brand">
													{t("models.best_price", "Best")}
												</Badge>
											)}
										</span>
									</td>
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
									<td className="py-2.5 pl-2 pr-4 text-sm font-mono text-right text-gray-600 dark:text-gray-400 sm:pr-5">
										{formatContext(p.contextLength)}
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

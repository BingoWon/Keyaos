import {
	ArrowPathIcon,
	ClipboardDocumentIcon,
	EyeIcon,
	EyeSlashIcon,
	PencilSquareIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/20/solid";
import { useState } from "react";
import toast from "react-hot-toast";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { CreateApiKeyModal } from "../components/CreateApiKeyModal";
import { EditApiKeyModal } from "../components/EditApiKeyModal";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { Badge, Button, PromoBanner } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import type { ApiKeyInfo } from "../types/api-key";
import { TOKENS } from "../utils/colors";
import { toastApiError } from "../utils/toast-error";

function RestrictionBadges({
	k,
	t,
}: {
	k: ApiKeyInfo;
	t: (s: string, o?: Record<string, unknown>) => string;
}) {
	const now = Date.now();
	const badges: {
		label: string;
		variant: "brand" | "warning" | "success" | "default";
	}[] = [];

	if (k.expiresAt) {
		if (k.expiresAt <= now) {
			badges.push({ label: t("api_keys.expired"), variant: "warning" });
		}
	}
	if (k.quotaLimit != null) {
		const pct = k.quotaLimit > 0 ? k.quotaUsed / k.quotaLimit : 1;
		badges.push({
			label: t("api_keys.quota_used_of", {
				used: `$${k.quotaUsed.toFixed(4)}`,
				limit: `$${k.quotaLimit.toFixed(2)}`,
			}),
			variant: pct >= 1 ? "warning" : pct >= 0.8 ? "default" : "success",
		});
	}
	if (k.allowedModels?.length) {
		badges.push({
			label: t("api_keys.models_badge", { count: k.allowedModels.length }),
			variant: "brand",
		});
	}
	if (k.allowedIps?.length) {
		badges.push({
			label: t("api_keys.ips_badge", { count: k.allowedIps.length }),
			variant: "brand",
		});
	}

	if (badges.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-1">
			{badges.map((b) => (
				<Badge key={b.label} variant={b.variant}>
					{b.label}
				</Badge>
			))}
		</div>
	);
}

export function ApiKeys() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const formatDateTime = useFormatDateTime();

	const {
		data: apiKeys,
		loading,
		refetch,
	} = useFetch<ApiKeyInfo[]>("/api/api-keys");

	const [isAddOpen, setIsAddOpen] = useState(false);
	const [editKey, setEditKey] = useState<ApiKeyInfo | null>(null);
	const [revealedKeys, setRevealedKeys] = useState<Map<string, string>>(
		new Map(),
	);
	const [revealingId, setRevealingId] = useState<string | null>(null);

	const getHeaders = async () => ({
		"Content-Type": "application/json",
		Authorization: `Bearer ${await getToken()}`,
	});

	const handleUpdate = async (
		id: string,
		updates: { name?: string; isEnabled?: number },
	) => {
		const tid = toast.loading(t("common.loading"));
		try {
			const res = await fetch(`/api/api-keys/${id}`, {
				method: "PATCH",
				headers: await getHeaders(),
				body: JSON.stringify(updates),
			});
			if (res.ok) {
				refetch();
				toast.success(t("common.success"), { id: tid });
			} else {
				const data = await res.json();
				toastApiError(data, t, tid);
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"), { id: tid });
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm(`${t("common.confirm")}?`)) return;
		const tid = toast.loading(t("common.loading"));
		try {
			const res = await fetch(`/api/api-keys/${id}`, {
				method: "DELETE",
				headers: await getHeaders(),
			});
			if (res.ok) {
				setRevealedKeys((prev) => {
					const next = new Map(prev);
					next.delete(id);
					return next;
				});
				refetch();
				toast.success(t("common.success"), { id: tid });
			} else {
				toast.error(t("common.error"), { id: tid });
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"), { id: tid });
		}
	};

	const toggleReveal = async (id: string) => {
		if (revealedKeys.has(id)) {
			setRevealedKeys((prev) => {
				const next = new Map(prev);
				next.delete(id);
				return next;
			});
			return;
		}
		setRevealingId(id);
		try {
			const res = await fetch(`/api/api-keys/${id}/reveal`, {
				headers: await getHeaders(),
			});
			if (res.ok) {
				const { key } = await res.json();
				setRevealedKeys((prev) => new Map(prev).set(id, key));
			} else {
				toast.error(t("common.error"));
			}
		} catch {
			toast.error(t("common.error"));
		} finally {
			setRevealingId(null);
		}
	};

	const copyKey = async (k: ApiKeyInfo) => {
		let plainKey = revealedKeys.get(k.id);
		if (!plainKey) {
			try {
				const res = await fetch(`/api/api-keys/${k.id}/reveal`, {
					headers: await getHeaders(),
				});
				if (!res.ok) {
					toast.error(t("common.error"));
					return;
				}
				plainKey = (await res.json()).key;
				setRevealedKeys((prev) => new Map(prev).set(k.id, plainKey as string));
			} catch {
				toast.error(t("common.error"));
				return;
			}
		}
		navigator.clipboard.writeText(plainKey);
		toast.success(t("api_keys.copied"));
	};

	return (
		<div>
			<div className="sm:flex sm:items-center">
				<div className="sm:flex-auto">
					<h1 className="text-xl font-semibold text-gray-900 dark:text-white">
						{t("api_keys.title")}
					</h1>
					<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{t("api_keys.subtitle")}
					</p>
				</div>
				<div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
					<Button onClick={() => setIsAddOpen(true)}>
						<PlusIcon aria-hidden="true" className="-ml-0.5 size-5" />
						{t("api_keys.create")}
					</Button>
				</div>
			</div>

			<PromoBanner
				id="api-keys"
				title={t("api_keys.promo_title")}
				description={
					<Trans
						i18nKey="api_keys.promo_desc"
						components={{
							OpenRouterLink: (
								// biome-ignore lint/a11y/useAnchorContent: Trans injects children at runtime
								<a
									href="https://openrouter.ai/announcements/bring-your-own-api-keys"
									target="_blank"
									rel="noopener noreferrer"
									className="font-semibold text-white hover:text-white/90 underline underline-offset-4 decoration-white/40 hover:decoration-white/80 transition-colors"
								/>
							),
						}}
					/>
				}
			/>

			<CreateApiKeyModal
				open={isAddOpen}
				onClose={() => setIsAddOpen(false)}
				onCreated={() => refetch()}
			/>

			<EditApiKeyModal
				open={!!editKey}
				onClose={() => setEditKey(null)}
				apiKey={editKey}
				onUpdated={refetch}
			/>

			<div className="mt-8 flow-root">
				<div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
					<div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
						<div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
							<table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
								<thead className="bg-gray-50 dark:bg-white/5">
									<tr>
										<th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 dark:text-white">
											{t("api_keys.name")}
										</th>
										<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
											{t("api_keys.key")}
										</th>
										<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
											{t("api_keys.permissions")}
										</th>
										<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
											{t("api_keys.expires_at")}
										</th>
										<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
											{t("api_keys.enabled")}
										</th>
										<th className="relative py-3.5 pl-3 pr-4 sm:pr-6">
											<span className="sr-only">{t("common.actions")}</span>
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-200 bg-white dark:divide-white/10 dark:bg-gray-900">
									{loading ? (
										Array.from({ length: 3 }).map((_, i) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
											<tr key={i}>
												<td className="py-4 pl-4 pr-3 sm:pl-6">
													<div className="h-4 w-24 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
												</td>
												<td className="px-3 py-4">
													<div className="h-4 w-48 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
												</td>
												<td className="px-3 py-4">
													<div className="h-4 w-24 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
												</td>
												<td className="px-3 py-4">
													<div className="h-4 w-28 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
												</td>
												<td className="px-3 py-4">
													<div className="h-5 w-9 rounded-full bg-gray-100 dark:bg-white/5 animate-pulse" />
												</td>
												<td className="py-4 pl-3 pr-4 sm:pr-6" />
											</tr>
										))
									) : !apiKeys?.length ? (
										<tr>
											<td
												colSpan={6}
												className="py-4 text-center text-sm text-gray-500"
											>
												{t("api_keys.no_data")}
											</td>
										</tr>
									) : (
										apiKeys.map((k) => (
											<tr
												key={k.id}
												className={k.isEnabled ? "" : "opacity-50"}
											>
												{/* Name */}
												<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 dark:text-white">
													{k.name}
												</td>
												{/* Key */}
												<td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">
													<div className="flex items-center gap-2">
														<span>{revealedKeys.get(k.id) ?? k.keyHint}</span>
														<button
															type="button"
															disabled={revealingId === k.id}
															onClick={() => toggleReveal(k.id)}
															className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-50"
															title={
																revealedKeys.has(k.id)
																	? t("common.hide")
																	: t("common.reveal")
															}
														>
															{revealingId === k.id ? (
																<ArrowPathIcon className="size-4 animate-spin" />
															) : revealedKeys.has(k.id) ? (
																<EyeSlashIcon className="size-4" />
															) : (
																<EyeIcon className="size-4" />
															)}
														</button>
														<button
															type="button"
															onClick={() => copyKey(k)}
															className="text-gray-400 hover:text-brand-500"
															title={t("common.copy")}
														>
															<ClipboardDocumentIcon className="size-4" />
														</button>
													</div>
												</td>
												{/* Permissions */}
												<td className="px-3 py-4 text-sm">
													<RestrictionBadges k={k} t={t} />
													{!k.allowedModels?.length &&
														!k.allowedIps?.length &&
														k.quotaLimit == null && (
															<span className="text-xs text-gray-400">
																{t("api_keys.no_restrictions")}
															</span>
														)}
												</td>
												{/* Expires */}
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
													{k.expiresAt ? (
														<span
															className={
																k.expiresAt <= Date.now() ? "text-red-500" : ""
															}
														>
															{formatDateTime(k.expiresAt)}
														</span>
													) : (
														<span className="text-gray-400">
															{t("api_keys.expires_never")}
														</span>
													)}
												</td>
												{/* Toggle */}
												<td className="whitespace-nowrap px-3 py-4 text-sm">
													<ToggleSwitch
														enabled={k.isEnabled}
														onChange={(val) =>
															handleUpdate(k.id, {
																isEnabled: val ? 1 : 0,
															})
														}
														label={t(
															k.isEnabled
																? "api_keys.enabled_true"
																: "api_keys.enabled_false",
														)}
													/>
												</td>
												{/* Actions */}
												<td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
													<div className="flex items-center justify-end gap-2">
														<button
															type="button"
															onClick={() => setEditKey(k)}
															className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-white/10"
															title={t("common.edit")}
														>
															<PencilSquareIcon className="size-4" />
														</button>
														<button
															type="button"
															onClick={() => handleDelete(k.id)}
															className={`rounded-md p-1 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10 ${TOKENS.red.text} ${TOKENS.red.textHover}`}
															title={t("common.delete")}
														>
															<TrashIcon className="size-4" />
														</button>
													</div>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

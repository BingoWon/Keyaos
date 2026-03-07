import {
	ArrowPathIcon,
	CheckIcon,
	ClipboardDocumentIcon,
	EyeIcon,
	EyeSlashIcon,
	PencilSquareIcon,
	PlusIcon,
	XMarkIcon,
} from "@heroicons/react/20/solid";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { CreateApiKeyModal } from "../components/CreateApiKeyModal";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { Button } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import type { ApiKeyInfo } from "../types/api-key";
import { TOKENS } from "../utils/colors";

import { RefreshControl } from "../components/RefreshControl";
import { useAutoRefresh } from "../hooks/useAutoRefresh";

export function ApiKeys() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const formatDateTime = useFormatDateTime();

	const {
		data: apiKeys,
		loading,
		refetch,
	} = useFetch<ApiKeyInfo[]>("/api/api-keys");

	const lastUpdated = useAutoRefresh(refetch, apiKeys);

	const [isAddOpen, setIsAddOpen] = useState(false);
	const [revealedKeys, setRevealedKeys] = useState<Map<string, string>>(
		new Map(),
	);
	const [revealingId, setRevealingId] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");

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
				setEditingId(null);
				refetch();
				toast.success(t("common.success"), { id: tid });
			} else {
				const data = await res.json();
				toast.error(data.error?.message || res.statusText, { id: tid });
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
				<div className="mt-4 flex sm:mt-0 sm:ml-16 sm:flex-none items-end gap-3">
					<RefreshControl
						loading={loading}
						lastUpdated={lastUpdated}
						onRefresh={refetch}
					/>
					<Button onClick={() => setIsAddOpen(true)}>
						<PlusIcon aria-hidden="true" className="-ml-0.5 size-5" />
						{t("api_keys.create")}
					</Button>
				</div>
			</div>

			<CreateApiKeyModal
				open={isAddOpen}
				onClose={() => setIsAddOpen(false)}
				onCreated={() => refetch()}
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
											{t("api_keys.created_at")}
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
												colSpan={5}
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
												{/* Name (editable) */}
												<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 dark:text-white">
													{editingId === k.id ? (
														<div className="flex items-center gap-2">
															<input
																type="text"
																value={editName}
																onChange={(e) => setEditName(e.target.value)}
																className="w-32 rounded-lg border border-gray-200 py-1 px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
															/>
															<button
																type="button"
																onClick={() =>
																	handleUpdate(k.id, { name: editName })
																}
																className={`${TOKENS.green.text} ${TOKENS.green.textHover}`}
																title={t("common.save")}
															>
																<CheckIcon className="size-5" />
															</button>
															<button
																type="button"
																onClick={() => setEditingId(null)}
																className={`${TOKENS.red.text} ${TOKENS.red.textHover}`}
																title={t("common.cancel")}
															>
																<XMarkIcon className="size-5" />
															</button>
														</div>
													) : (
														<span className="flex items-center">
															{k.name}
															<button
																type="button"
																onClick={() => {
																	setEditingId(k.id);
																	setEditName(k.name);
																}}
																className="ml-2 text-gray-400 hover:text-brand-500"
																title={t("common.edit")}
															>
																<PencilSquareIcon className="size-4" />
															</button>
														</span>
													)}
												</td>
												{/* Key (hint / revealed) */}
												<td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">
													<div className="flex items-center gap-2">
														<span>{revealedKeys.get(k.id) ?? k.keyHint}</span>
														<button
															type="button"
															disabled={revealingId === k.id}
															onClick={() => toggleReveal(k.id)}
															className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-50"
															title={revealedKeys.has(k.id) ? "Hide" : "Reveal"}
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
															title="Copy"
														>
															<ClipboardDocumentIcon className="size-4" />
														</button>
													</div>
												</td>
												{/* Created */}
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
													{formatDateTime(k.createdAt)}
												</td>
												{/* Enabled toggle */}
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
													<button
														type="button"
														onClick={() => handleDelete(k.id)}
														className={`${TOKENS.red.text} ${TOKENS.red.textHover}`}
													>
														{t("common.delete")}
													</button>
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

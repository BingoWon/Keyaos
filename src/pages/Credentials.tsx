import {
	CheckIcon,
	ClipboardDocumentIcon,
	EyeIcon,
	EyeSlashIcon,
	PencilSquareIcon,
	PlusIcon,
	XMarkIcon,
} from "@heroicons/react/20/solid";
import type React from "react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { HealthBadge, type HealthStatus } from "../components/HealthBadge";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";

interface ProviderInfo {
	id: string;
	name: string;
	supportsAutoCredits: boolean;
	authType: "api_key" | "oauth";
}

interface CredentialInfo {
	id: string;
	provider: string;
	authType: string;
	secretHint: string;
	quota: number | null;
	quotaSource: "auto" | "manual" | null;
	health: HealthStatus;
	isEnabled: boolean;
	priceMultiplier: number;
	addedAt: number;
}

export function Credentials() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const formatDateTime = useFormatDateTime();

	const { data, loading, refetch } =
		useFetch<CredentialInfo[]>("/api/credentials");
	const credentials = data || [];

	const { data: providersData } = useFetch<ProviderInfo[]>("/api/providers");
	const providers = providersData || [];

	const [isAddOpen, setIsAddOpen] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [draft, setDraft] = useState({
		provider: "openrouter",
		secret: "",
		quota: "",
		isEnabled: true,
		priceMultiplier: "1.0",
	});
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editQuota, setEditQuota] = useState("");
	const [editingSettingsId, setEditingSettingsId] = useState<string | null>(
		null,
	);
	const [editPriceMultiplier, setEditPriceMultiplier] = useState("");

	const getHeaders = async () => ({
		"Content-Type": "application/json",
		Authorization: `Bearer ${await getToken()}`,
	});

	const selectedProvider = providers.find((p) => p.id === draft.provider);
	const isAutoProvider = selectedProvider?.supportsAutoCredits ?? false;
	const isOAuthProvider = selectedProvider?.authType === "oauth";
	const needsManualQuota = !isAutoProvider && !isOAuthProvider;

	const handleAdd = async (e: React.FormEvent) => {
		e.preventDefault();
		const tid = toast.loading(t("common.loading"));
		try {
			const body: Record<string, unknown> = {
				provider: draft.provider,
				secret: draft.secret,
				isEnabled: draft.isEnabled ? 1 : 0,
				priceMultiplier: Number.parseFloat(draft.priceMultiplier) || 1.0,
			};

			if (needsManualQuota && draft.quota) {
				body.quota = Number.parseFloat(draft.quota) || 0;
			}

			const res = await fetch("/api/credentials", {
				method: "POST",
				headers: await getHeaders(),
				body: JSON.stringify(body),
			});
			const data = await res.json();
			if (res.ok) {
				setIsAddOpen(false);
				setDraft({
					provider: "openrouter",
					secret: "",
					quota: "",
					isEnabled: true,
					priceMultiplier: "1.0",
				});
				setShowPassword(false);
				refetch();
				toast.success(t("common.success"), { id: tid });
			} else {
				toast.error(data.error?.message || res.statusText, { id: tid });
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"), { id: tid });
		}
	};

	const handleUpdateQuota = async (id: string) => {
		const tid = toast.loading(t("common.loading"));
		try {
			const res = await fetch(`/api/credentials/${id}/quota`, {
				method: "PATCH",
				headers: await getHeaders(),
				body: JSON.stringify({
					quota: Number.parseFloat(editQuota) || 0,
				}),
			});
			const data = await res.json();
			if (res.ok) {
				setEditingId(null);
				refetch();
				toast.success(t("common.success"), { id: tid });
			} else {
				toast.error(data.error?.message || res.statusText, { id: tid });
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"), { id: tid });
		}
	};

	const handleUpdateSettings = async (
		id: string,
		isEnabled: boolean,
		priceMultiplier: number,
	) => {
		const tid = toast.loading(t("common.loading"));
		try {
			const res = await fetch(`/api/credentials/${id}/settings`, {
				method: "PATCH",
				headers: await getHeaders(),
				body: JSON.stringify({ isEnabled: isEnabled ? 1 : 0, priceMultiplier }),
			});
			const data = await res.json();
			if (res.ok) {
				refetch();
				toast.success(t("common.success"), { id: tid });
			} else {
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
			const res = await fetch(`/api/credentials/${id}`, {
				method: "DELETE",
				headers: await getHeaders(),
			});
			if (res.ok) {
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

	const formatQuota = (cred: CredentialInfo) => {
		if (cred.quota == null) return t("credentials.no_quota");
		return cred.quota.toFixed(2);
	};

	return (
		<div>
			<div className="sm:flex sm:items-center">
				<div className="sm:flex-auto">
					<h1 className="text-base font-semibold text-gray-900 dark:text-white">
						{t("credentials.title")}
					</h1>
					<p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
						{t("credentials.subtitle")}
					</p>
				</div>
				<div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
					<button
						type="button"
						onClick={() => setIsAddOpen(true)}
						className="inline-flex items-center gap-x-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
					>
						<PlusIcon aria-hidden="true" className="-ml-0.5 size-5" />
						{t("credentials.add_new")}
					</button>
				</div>
			</div>

			{isAddOpen && (
				<div className="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-white/5 border border-gray-200 dark:border-white/10">
					<form
						onSubmit={handleAdd}
						className="flex flex-col sm:flex-row gap-4 items-end"
					>
						<div className="w-full sm:w-auto">
							<label
								htmlFor="provider"
								className="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								{t("credentials.provider")}
							</label>
							<select
								id="provider"
								value={draft.provider}
								onChange={(e) =>
									setDraft({ ...draft, provider: e.target.value })
								}
								className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
							>
								{providers.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</div>
						<div className="w-full sm:flex-1">
							<label
								htmlFor="secret"
								className="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								{t("credentials.secret")}
							</label>
							<div className="relative mt-1">
								<input
									type={showPassword ? "text" : "password"}
									id="secret"
									required
									value={draft.secret}
									onChange={(e) =>
										setDraft({ ...draft, secret: e.target.value })
									}
									className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
									placeholder={isOAuthProvider ? "refresh_token" : "sk-..."}
								/>
								<button
									type="button"
									onClick={() => setShowPassword(!showPassword)}
									className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
								>
									{showPassword ? (
										<EyeSlashIcon className="size-5" />
									) : (
										<EyeIcon className="size-5" />
									)}
								</button>
							</div>
						</div>
						{needsManualQuota && (
							<div className="w-full sm:w-32">
								<label
									htmlFor="quota"
									className="block text-sm font-medium text-gray-700 dark:text-gray-300"
								>
									{t("credentials.quota")}
								</label>
								<input
									type="number"
									id="quota"
									min="0"
									step="0.01"
									value={draft.quota}
									onChange={(e) =>
										setDraft({ ...draft, quota: e.target.value })
									}
									className="mt-1 block w-full rounded-md border-gray-300 py-2 px-3 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
									placeholder="10.00"
								/>
							</div>
						)}
						<div className="w-full sm:w-80">
							<label
								htmlFor="priceMultiplier"
								className="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								{t("credentials.price_multiplier")}
							</label>
							<input
								type="number"
								id="priceMultiplier"
								min="0.1"
								step="0.01"
								required
								value={draft.priceMultiplier}
								onChange={(e) =>
									setDraft({
										...draft,
										priceMultiplier: e.target.value,
									})
								}
								className="mt-1 block w-full rounded-md border-gray-300 py-2 px-3 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
								placeholder="1.0"
							/>
							{draft.priceMultiplier && (
								<p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
									{t("credentials.price_multiplier_helper", {
										ratio: draft.priceMultiplier,
										credited: (
											1.0 * (Number.parseFloat(draft.priceMultiplier) || 0)
										).toFixed(2),
									})}
								</p>
							)}
						</div>
						<div className="flex gap-2 w-full sm:w-auto">
							<button
								type="button"
								onClick={() => {
									setIsAddOpen(false);
									setShowPassword(false);
								}}
								className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-0 dark:hover:bg-white/20"
							>
								{t("common.cancel")}
							</button>
							<button
								type="submit"
								className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
							>
								{t("common.save")}
							</button>
						</div>
					</form>
				</div>
			)}

			<div className="mt-8 flow-root">
				<div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
					<div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
						<div className="overflow-hidden shadow-sm ring-1 ring-black/5 sm:rounded-lg dark:ring-white/10">
							<table className="min-w-full divide-y divide-gray-300 dark:divide-white/10">
								<thead className="bg-gray-50 dark:bg-white/5">
									<tr>
										<th
											scope="col"
											className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
										>
											{t("credentials.provider")}
										</th>
										<th
											scope="col"
											className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
										>
											{t("credentials.secret")}
										</th>
										<th
											scope="col"
											className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
										>
											{t("credentials.quota")}
										</th>
										<th
											scope="col"
											className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
										>
											{t("credentials.price_multiplier")}
										</th>
										<th
											scope="col"
											className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
										>
											{t("credentials.health")}
										</th>
										<th
											scope="col"
											className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
										>
											{t("credentials.added")}
										</th>
										<th
											scope="col"
											className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
										>
											{t("credentials.enabled")}
										</th>
										<th
											scope="col"
											className="relative py-3.5 pl-3 pr-4 sm:pr-6"
										>
											<span className="sr-only">{t("common.actions")}</span>
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-200 bg-white dark:divide-white/10 dark:bg-gray-900">
									{loading ? (
										<tr>
											<td colSpan={8} className="py-10">
												<PageLoader />
											</td>
										</tr>
									) : credentials.length === 0 ? (
										<tr>
											<td
												colSpan={8}
												className="py-4 text-center text-sm text-gray-500 dark:text-gray-400"
											>
												{t("credentials.no_data")}
											</td>
										</tr>
									) : (
										credentials.map((cred) => (
											<tr
												key={cred.id}
												className={cred.isEnabled ? "" : "opacity-50"}
											>
												<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 dark:text-white">
													{cred.provider}
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">
													<div className="flex items-center gap-2">
														{cred.secretHint}
														<button
															type="button"
															onClick={() => {
																navigator.clipboard.writeText(cred.secretHint);
																toast.success("Copied to clipboard");
															}}
															className="text-gray-400 hover:text-indigo-500"
															title="Copy hint"
														>
															<ClipboardDocumentIcon className="size-4" />
														</button>
													</div>
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm">
													{editingId === cred.id ? (
														<div className="flex items-center gap-2">
															<input
																type="number"
																min="0"
																step="0.01"
																value={editQuota}
																onChange={(e) => setEditQuota(e.target.value)}
																className="w-20 rounded-md border-gray-300 py-1 px-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
															/>
															<button
																type="button"
																onClick={() => handleUpdateQuota(cred.id)}
																className="text-green-600 hover:text-green-900 dark:text-green-400"
																title={t("common.save")}
															>
																<CheckIcon className="size-5" />
															</button>
															<button
																type="button"
																onClick={() => setEditingId(null)}
																className="text-red-500 hover:text-red-700 dark:text-red-400"
																title={t("common.cancel")}
															>
																<XMarkIcon className="size-5" />
															</button>
														</div>
													) : (
														<span
															className={`font-mono flex items-center ${
																cred.quota == null
																	? "text-gray-400 dark:text-gray-500"
																	: cred.quota > 0
																		? "text-green-600 dark:text-green-400"
																		: "text-red-500 dark:text-red-400"
															}`}
														>
															{formatQuota(cred)}
															{cred.quotaSource === "manual" && (
																<button
																	type="button"
																	onClick={() => {
																		setEditingId(cred.id);
																		setEditQuota((cred.quota ?? 0).toString());
																	}}
																	className="ml-2 text-gray-400 hover:text-indigo-500"
																	title={t("common.edit")}
																>
																	<PencilSquareIcon className="size-4" />
																</button>
															)}
														</span>
													)}
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
													{editingSettingsId === cred.id ? (
														<div className="flex items-center gap-2">
															<input
																type="number"
																min="0.1"
																step="0.01"
																value={editPriceMultiplier}
																onChange={(e) =>
																	setEditPriceMultiplier(e.target.value)
																}
																className="w-16 rounded-md border-gray-300 py-1 px-1 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
															/>
															<button
																type="button"
																onClick={() => {
																	handleUpdateSettings(
																		cred.id,
																		cred.isEnabled,
																		Number.parseFloat(editPriceMultiplier),
																	);
																	setEditingSettingsId(null);
																}}
																className="text-green-600 hover:text-green-900 dark:text-green-400"
																title={t("common.save")}
															>
																<CheckIcon className="size-5" />
															</button>
															<button
																type="button"
																onClick={() => setEditingSettingsId(null)}
																className="text-red-500 hover:text-red-700 dark:text-red-400"
																title={t("common.cancel")}
															>
																<XMarkIcon className="size-5" />
															</button>
														</div>
													) : (
														<div className="flex items-center font-mono text-gray-900 dark:text-white">
															{cred.priceMultiplier}x
															<button
																type="button"
																onClick={() => {
																	setEditingSettingsId(cred.id);
																	setEditPriceMultiplier(
																		cred.priceMultiplier.toString(),
																	);
																}}
																className="ml-2 text-gray-400 hover:text-indigo-500"
																title={t("common.edit")}
															>
																<PencilSquareIcon className="size-4" />
															</button>
														</div>
													)}
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
													<HealthBadge status={cred.health} />
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
													{formatDateTime(cred.addedAt)}
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
													<label className="inline-flex items-center cursor-pointer">
														<input
															type="checkbox"
															className="sr-only peer"
															checked={cred.isEnabled}
															onChange={(e) =>
																handleUpdateSettings(
																	cred.id,
																	e.target.checked,
																	cred.priceMultiplier,
																)
															}
														/>
														<div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600" />
														<span
															className={`ml-2 text-xs font-medium ${cred.isEnabled ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400"}`}
														>
															{t(
																cred.isEnabled
																	? "credentials.enabled_true"
																	: "credentials.enabled_false",
															)}
														</span>
													</label>
												</td>
												<td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
													<button
														type="button"
														onClick={() => handleDelete(cred.id)}
														className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
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

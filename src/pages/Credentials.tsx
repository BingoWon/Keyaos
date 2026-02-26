import {
	ArrowPathIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	ClipboardDocumentIcon,
	EyeIcon,
	EyeSlashIcon,
	PencilSquareIcon,
	PlusIcon,
	XMarkIcon,
} from "@heroicons/react/20/solid";
import {
	CommandLineIcon,
	InformationCircleIcon,
} from "@heroicons/react/24/outline";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { HealthBadge, type HealthStatus } from "../components/HealthBadge";
import { PageLoader } from "../components/PageLoader";
import { ProviderLogo } from "../components/ProviderLogo";
import { ProviderSelect } from "../components/ProviderSelect";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { Button, Input } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import type { CredentialGuide, ProviderMeta } from "../types/provider";
import { formatUSD } from "../utils/format";

interface CredentialInfo {
	id: string;
	provider: string;
	authType: "api_key" | "oauth";
	secretHint: string;
	quota: number | null;
	quotaSource: "auto" | "manual" | null;
	health: HealthStatus;
	isEnabled: boolean;
	priceMultiplier: number;
	addedAt: number;
	earnings: number;
}

export function Credentials() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const formatDateTime = useFormatDateTime();

	const { data, loading, refetch } =
		useFetch<CredentialInfo[]>("/api/credentials");
	const credentials = data || [];

	const { data: providersData } = useFetch<ProviderMeta[]>("/api/providers");
	const providers = providersData || [];

	const [isAddOpen, setIsAddOpen] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const defaultProvider = providers[0]?.id ?? "openrouter";
	const [draft, setDraft] = useState({
		provider: defaultProvider,
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
	const [refreshingQuotaId, setRefreshingQuotaId] = useState<string | null>(
		null,
	);

	const getHeaders = async () => ({
		"Content-Type": "application/json",
		Authorization: `Bearer ${await getToken()}`,
	});

	const selectedProvider = providers.find((p) => p.id === draft.provider);
	const isAutoProvider = selectedProvider?.supportsAutoCredits ?? false;
	const isSubProvider = selectedProvider?.isSubscription ?? false;
	const needsManualQuota = !isAutoProvider && !isSubProvider;
	const isOAuth = selectedProvider?.authType === "oauth";
	const guide = selectedProvider?.credentialGuide;
	const [guideOpen, setGuideOpen] = useState(true);
	const [priceMultiplierTouched, setPriceMultiplierTouched] = useState(false);

	const secretHint = useMemo<{
		type: "json" | "access_token" | null;
		message: string;
	}>(() => {
		const v = draft.secret.trim();
		if (!v) return { type: null, message: "" };
		if (v.startsWith("{"))
			return { type: "json", message: t("credentials.hint_json_detected") };
		if (v.startsWith("ya29.") || v.startsWith("aoa"))
			return {
				type: "access_token",
				message: t("credentials.hint_access_token"),
			};
		return { type: null, message: "" };
	}, [draft.secret, t]);

	const handleAdd = async (e: React.FormEvent) => {
		e.preventDefault();

		if (needsManualQuota && !draft.quota) {
			toast.error(t("credentials.error_quota_required"));
			return;
		}

		const trimmedSecret = draft.secret.trim();
		if (guide?.secretPattern && !isOAuth) {
			const re = new RegExp(guide.secretPattern);
			if (!re.test(trimmedSecret)) {
				toast.error(
					t("credentials.error_secret_format", {
						example: guide.placeholder,
					}),
				);
				return;
			}
		}

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
					provider: defaultProvider,
					secret: "",
					quota: "",
					isEnabled: true,
					priceMultiplier: providers.find((p) => p.id === defaultProvider)
						?.isSubscription
						? "0.5"
						: "0.8",
				});
				setShowPassword(false);
				setPriceMultiplierTouched(false);
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

	const handleRefreshQuota = async (id: string) => {
		setRefreshingQuotaId(id);
		try {
			const res = await fetch(`/api/credentials/${id}/quota`, {
				headers: await getHeaders(),
			});
			if (res.ok) {
				refetch();
				toast.success(t("common.success"));
			} else {
				const data = await res.json();
				toast.error(data.error?.message || res.statusText);
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"));
		} finally {
			setRefreshingQuotaId(null);
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

	const isSubscription = (cred: CredentialInfo) =>
		providers.find((p) => p.id === cred.provider)?.isSubscription ?? false;

	const formatQuota = (cred: CredentialInfo) => {
		if (isSubscription(cred)) return t("credentials.subscription");
		if (cred.quota == null) return t("credentials.no_quota");
		return formatUSD(cred.quota);
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
					<Button
						onClick={() => {
							const pid = providers[0]?.id ?? "openrouter";
							const isSub =
								providers.find((p) => p.id === pid)?.isSubscription ?? false;
							setDraft({
								provider: pid,
								secret: "",
								quota: "",
								isEnabled: true,
								priceMultiplier: isSub ? "0.5" : "0.8",
							});
							setPriceMultiplierTouched(false);
							setShowPassword(false);
							setIsAddOpen(true);
						}}
					>
						<PlusIcon aria-hidden="true" className="-ml-0.5 size-5" />
						{t("credentials.add_new")}
					</Button>
				</div>
			</div>

			{isAddOpen && (
				<div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/5">
					<form onSubmit={handleAdd} className="space-y-4">
						{/* Row 1: Provider selector */}
						<div className="w-full sm:w-64">
							<label
								htmlFor="provider"
								className="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								{t("credentials.provider")}
							</label>
							<div className="mt-1">
								<ProviderSelect
									id="provider"
									providers={providers}
									value={draft.provider}
									onChange={(newId) => {
										const isSub =
											providers.find((p) => p.id === newId)?.isSubscription ??
											false;
										setDraft((d) => ({
											...d,
											provider: newId,
											...(!priceMultiplierTouched && {
												priceMultiplier: isSub ? "0.5" : "0.8",
											}),
										}));
									}}
								/>
							</div>
						</div>

						{/* Guidance panel */}
						{guide && (
							<GuidancePanel
								guide={guide}
								providerId={draft.provider}
								isOAuth={isOAuth}
								open={guideOpen}
								onToggle={() => setGuideOpen(!guideOpen)}
							/>
						)}

						{/* Row 2: Secret input */}
						<div>
							<label
								htmlFor="secret"
								className="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								{t("credentials.secret")}
							</label>
							<div className="relative mt-1">
								{isOAuth ? (
									<textarea
										id="secret"
										required
										rows={showPassword ? 4 : 1}
										value={
											showPassword
												? draft.secret
												: draft.secret
													? "\u2022".repeat(Math.min(draft.secret.length, 40))
													: ""
										}
										onChange={(e) => {
											if (showPassword)
												setDraft({ ...draft, secret: e.target.value });
										}}
										onFocus={() => {
											if (!showPassword) setShowPassword(true);
										}}
										onPaste={(e) => {
											if (!showPassword) {
												e.preventDefault();
												const text = e.clipboardData.getData("text");
												setDraft({ ...draft, secret: text });
												setShowPassword(true);
											}
										}}
										className="block w-full rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-10 font-mono text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-500 resize-none"
										placeholder={guide?.placeholder ?? "refresh_token or JSON"}
									/>
								) : (
									<Input
										type={showPassword ? "text" : "password"}
										id="secret"
										required
										value={draft.secret}
										onChange={(e) =>
											setDraft({ ...draft, secret: e.target.value })
										}
										className="pr-10"
										placeholder={guide?.placeholder ?? "sk-..."}
									/>
								)}
								<button
									type="button"
									onClick={() => setShowPassword(!showPassword)}
									className="absolute top-2 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
								>
									{showPassword ? (
										<EyeSlashIcon className="size-5" />
									) : (
										<EyeIcon className="size-5" />
									)}
								</button>
							</div>
							{/* Smart format detection hint */}
							{secretHint.type && (
								<p
									className={`mt-1.5 flex items-center gap-1 text-xs ${
										secretHint.type === "json"
											? "text-green-600 dark:text-green-400"
											: "text-amber-600 dark:text-amber-400"
									}`}
								>
									<InformationCircleIcon className="size-4 shrink-0" />
									{secretHint.message}
								</p>
							)}
						</div>

						{/* Row 3: Quota + Price Multiplier side by side */}
						<div className="flex flex-col sm:flex-row gap-4">
							{needsManualQuota && (
								<div className="w-full sm:w-40">
									<label
										htmlFor="quota"
										className="block text-sm font-medium text-gray-700 dark:text-gray-300"
									>
										{t("credentials.quota")}
									</label>
									<Input
										type="number"
										id="quota"
										min="0"
										step="0.01"
										value={draft.quota}
										onChange={(e) =>
											setDraft({ ...draft, quota: e.target.value })
										}
										className="mt-1"
										placeholder="10.00"
									/>
								</div>
							)}
							<div className="w-full sm:w-56">
								<label
									htmlFor="priceMultiplier"
									className="block text-sm font-medium text-gray-700 dark:text-gray-300"
								>
									{t("credentials.price_multiplier")}
								</label>
								<Input
									type="number"
									id="priceMultiplier"
									min="0.01"
									max="1"
									step="0.01"
									required
									value={draft.priceMultiplier}
									onChange={(e) => {
										setDraft({ ...draft, priceMultiplier: e.target.value });
										setPriceMultiplierTouched(true);
									}}
									className="mt-1"
									placeholder="0.8"
								/>
								{draft.priceMultiplier && (
									<p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
										{t("credentials.price_multiplier_helper", {
											ratio: draft.priceMultiplier,
											credited: (
												1.0 * (Number.parseFloat(draft.priceMultiplier) || 0)
											).toFixed(2),
										})}
									</p>
								)}
							</div>
						</div>

						{/* Row 4: Actions */}
						<div className="flex justify-end gap-3 pt-1">
							<Button
								variant="secondary"
								onClick={() => {
									setIsAddOpen(false);
									setShowPassword(false);
									setPriceMultiplierTouched(false);
								}}
							>
								{t("common.cancel")}
							</Button>
							<Button type="submit">{t("common.save")}</Button>
						</div>
					</form>
				</div>
			)}

			<div className="mt-8 flow-root">
				<div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
					<div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
						<div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
							<table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
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
											{t("credentials.earnings")}
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
											<td colSpan={9} className="py-10">
												<PageLoader />
											</td>
										</tr>
									) : credentials.length === 0 ? (
										<tr>
											<td
												colSpan={9}
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
												{/* Provider */}
												<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 dark:text-white">
													{(() => {
														const meta = providers.find(
															(p) => p.id === cred.provider,
														);
														return (
															<span className="inline-flex items-center gap-2">
																{meta && (
																	<ProviderLogo
																		src={meta.logoUrl}
																		name={meta.name}
																	/>
																)}
																{meta?.name ?? cred.provider}
															</span>
														);
													})()}
												</td>
												{/* Secret */}
												<td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">
													<div className="flex items-center gap-2">
														{cred.secretHint}
														<button
															type="button"
															onClick={() => {
																navigator.clipboard.writeText(cred.secretHint);
																toast.success("Copied to clipboard");
															}}
															className="text-gray-400 hover:text-brand-500"
															title="Copy hint"
														>
															<ClipboardDocumentIcon className="size-4" />
														</button>
													</div>
												</td>
												{/* Quota */}
												<td className="whitespace-nowrap px-3 py-4 text-sm">
													{editingId === cred.id ? (
														<div className="flex items-center gap-2">
															<input
																type="number"
																min="0"
																step="0.01"
																value={editQuota}
																onChange={(e) => setEditQuota(e.target.value)}
																className="w-20 rounded-lg border border-gray-200 bg-white py-1 px-2 text-sm text-gray-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
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
																isSubscription(cred)
																	? "text-brand-500 dark:text-brand-400"
																	: cred.quota == null
																		? "text-gray-400 dark:text-gray-500"
																		: cred.quota > 0
																			? "text-green-600 dark:text-green-400"
																			: "text-red-500 dark:text-red-400"
															}`}
														>
															{formatQuota(cred)}
															{cred.quotaSource === "auto" && (
																<button
																	type="button"
																	disabled={refreshingQuotaId === cred.id}
																	onClick={() => handleRefreshQuota(cred.id)}
																	className="ml-2 text-gray-400 hover:text-brand-500 disabled:opacity-50"
																	title={t("credentials.refresh_quota")}
																>
																	<ArrowPathIcon
																		className={`size-4 ${refreshingQuotaId === cred.id ? "animate-spin" : ""}`}
																	/>
																</button>
															)}
															{cred.quotaSource === "manual" && (
																<button
																	type="button"
																	onClick={() => {
																		setEditingId(cred.id);
																		setEditQuota((cred.quota ?? 0).toString());
																	}}
																	className="ml-2 text-gray-400 hover:text-brand-500"
																	title={t("common.edit")}
																>
																	<PencilSquareIcon className="size-4" />
																</button>
															)}
														</span>
													)}
												</td>
												{/* Earnings */}
												<td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-gray-900 dark:text-white">
													{formatUSD(cred.earnings)}
												</td>
												{/* Price Multiplier */}
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
													{editingSettingsId === cred.id ? (
														<div className="flex items-center gap-2">
															<input
																type="number"
																min="0.01"
																max="1"
																step="0.01"
																value={editPriceMultiplier}
																onChange={(e) =>
																	setEditPriceMultiplier(e.target.value)
																}
																className="w-16 rounded-lg border border-gray-200 bg-white py-1 px-1 text-sm text-gray-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
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
																className="ml-2 text-gray-400 hover:text-brand-500"
																title={t("common.edit")}
															>
																<PencilSquareIcon className="size-4" />
															</button>
														</div>
													)}
												</td>
												{/* Health */}
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
													<HealthBadge status={cred.health} />
												</td>
												{/* Added */}
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
													{formatDateTime(cred.addedAt)}
												</td>
												{/* Enabled */}
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
													<ToggleSwitch
														enabled={cred.isEnabled}
														onChange={(val) =>
															handleUpdateSettings(
																cred.id,
																val,
																cred.priceMultiplier,
															)
														}
														label={t(
															cred.isEnabled
																? "credentials.enabled_true"
																: "credentials.enabled_false",
														)}
													/>
												</td>
												{/* Actions */}
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

// ─── Guidance Panel ─────────────────────────────────────

function GuidancePanel({
	guide,
	providerId,
	isOAuth,
	open,
	onToggle,
}: {
	guide: CredentialGuide;
	providerId: string;
	isOAuth: boolean;
	open: boolean;
	onToggle: () => void;
}) {
	const { t } = useTranslation();

	const steps = t(`credentials.guide_steps.${providerId}`, {
		returnObjects: true,
		defaultValue: [],
	}) as string[];

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success(t("credentials.copied"));
	};

	if (!steps.length || (!isOAuth && steps.length <= 1)) return null;

	return (
		<div className="rounded-lg border border-brand-100 bg-brand-50/50 dark:border-brand-500/20 dark:bg-brand-500/5">
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
			>
				<span className="flex items-center gap-1.5">
					<InformationCircleIcon className="size-4" />
					{t("credentials.guide_title")}
				</span>
				{open ? (
					<ChevronUpIcon className="size-4" />
				) : (
					<ChevronDownIcon className="size-4" />
				)}
			</button>

			{open && (
				<div className="px-3 pb-3 space-y-2">
					<ol className="list-none space-y-1.5">
						{steps.map((step, idx) => (
							<li
								key={step}
								className="flex gap-2 text-sm text-gray-700 dark:text-gray-300"
							>
								<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-medium text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
									{idx + 1}
								</span>
								<span>
									<LinkifiedText text={step} />
								</span>
							</li>
						))}
					</ol>

					{guide.command &&
						(Array.isArray(guide.command)
							? guide.command
							: [guide.command]
						).map((cmd) => (
							<CopyableCommand
								key={cmd}
								command={cmd}
								onCopy={copyToClipboard}
							/>
						))}

					{guide.filePath && (
						<div className="flex items-center justify-between gap-2">
							<p className="text-xs text-gray-500 dark:text-gray-400">
								{t("credentials.guide_file_location")}{" "}
								<code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-gray-700 dark:bg-white/10 dark:text-gray-300">
									{guide.filePath}
								</code>
							</p>
							<CopyPromptButton providerId={providerId} />
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function LinkifiedText({ text }: { text: string }) {
	const parts = text.split(/(https?:\/\/[^\s)]+)/);
	if (parts.length === 1) return <>{text}</>;
	return (
		<>
			{parts.map((part) =>
				part.match(/^https?:\/\//) ? (
					<a
						key={part}
						href={part}
						target="_blank"
						rel="noopener noreferrer"
						className="text-brand-600 hover:text-brand-500 dark:text-brand-400 dark:hover:text-brand-300 underline"
					>
						{part}
					</a>
				) : (
					part
				),
			)}
		</>
	);
}

function CopyPromptButton({ providerId }: { providerId: string }) {
	const { t } = useTranslation();
	const [hover, setHover] = useState(false);
	const [pos, setPos] = useState({ x: 0, y: 0 });

	const prompt = t(`credentials.copy_prompt_text.${providerId}`);

	const onMove = useCallback((e: React.MouseEvent) => {
		setPos({ x: e.clientX, y: e.clientY });
	}, []);

	return (
		<>
			<button
				type="button"
				onMouseEnter={() => setHover(true)}
				onMouseLeave={() => setHover(false)}
				onMouseMove={onMove}
				onClick={() => {
					navigator.clipboard.writeText(prompt);
					toast.success(t("credentials.copied"));
				}}
				className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
			>
				<ClipboardDocumentIcon className="size-3.5" />
				{t("credentials.copy_prompt")}
			</button>
			{hover && (
				<div
					className="fixed z-50 max-w-xs rounded-lg bg-gray-900 px-3 py-2.5 text-xs shadow-xl pointer-events-none"
					style={{ left: pos.x + 14, top: pos.y + 14 }}
				>
					<p className="font-medium text-amber-300 mb-1.5">
						{t("credentials.copy_prompt_tooltip")}
					</p>
					<p className="text-gray-400 whitespace-pre-wrap line-clamp-6 leading-relaxed">
						{prompt}
					</p>
				</div>
			)}
		</>
	);
}

function CopyableCommand({
	command,
	onCopy,
}: {
	command: string;
	onCopy: (text: string) => void;
}) {
	return (
		<div className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 font-mono text-xs text-gray-100 dark:bg-black/40">
			<CommandLineIcon className="size-4 shrink-0 text-gray-400" />
			<code className="flex-1 select-all truncate">{command}</code>
			<button
				type="button"
				onClick={() => onCopy(command)}
				className="shrink-0 text-gray-400 hover:text-white transition-colors"
				title="Copy"
			>
				<ClipboardDocumentIcon className="size-4" />
			</button>
		</div>
	);
}

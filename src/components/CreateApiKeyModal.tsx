import {
	CheckIcon,
	ChevronDownIcon,
	ClipboardDocumentIcon,
} from "@heroicons/react/20/solid";
import type React from "react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { TOKENS } from "../utils/colors";
import { type ExpiryPreset, expiryToTimestamp } from "../utils/expiry";
import { toastApiError } from "../utils/toast-error";
import { IpAllowlistInput } from "./IpAllowlistInput";
import { Modal } from "./Modal";
import { ModelMultiSelect } from "./ModelMultiSelect";
import { ToggleSwitch } from "./ToggleSwitch";
import { Button, Input } from "./ui";

interface CreatedKey {
	id: string;
	name: string;
	plainKey: string;
}

interface CreateApiKeyModalProps {
	open: boolean;
	onClose: () => void;
	onCreated?: (key: CreatedKey) => void;
}

export function CreateApiKeyModal({
	open,
	onClose,
	onCreated,
}: CreateApiKeyModalProps) {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const [name, setName] = useState("");
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	// Advanced settings
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("never");
	const [customDate, setCustomDate] = useState("");
	const [quotaEnabled, setQuotaEnabled] = useState(false);
	const [quotaLimit, setQuotaLimit] = useState("");
	const [allowedModels, setAllowedModels] = useState<string[]>([]);
	const [allowedIps, setAllowedIps] = useState<string[]>([]);

	const handleClose = () => {
		onClose();
		setTimeout(() => {
			setCreatedKey(null);
			setName("");
			setCopied(false);
			setShowAdvanced(false);
			setExpiryPreset("never");
			setCustomDate("");
			setQuotaEnabled(false);
			setQuotaLimit("");
			setAllowedModels([]);
			setAllowedIps([]);
		}, 200);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const tid = toast.loading(t("common.loading"));

		try {
			const res = await fetch("/api/api-keys", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${await getToken()}`,
				},
				body: JSON.stringify({
					name,
					expiresAt: expiryToTimestamp(expiryPreset, customDate),
					quotaLimit: quotaEnabled && quotaLimit ? Number(quotaLimit) : null,
					allowedModels: allowedModels.length ? allowedModels : null,
					allowedIps: allowedIps.length ? allowedIps : null,
				}),
			});
			const result = await res.json();
			if (res.ok) {
				setCreatedKey(result.data.plainKey);
				setCopied(false);
				setName("");
				onCreated?.({
					id: result.data.id,
					name: result.data.name,
					plainKey: result.data.plainKey,
				});
				toast.success(t("common.success"), { id: tid });
			} else {
				toastApiError(result, t, tid);
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"), { id: tid });
		}
	};

	const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300";
	const hintCls = "mt-1 text-xs text-gray-400 dark:text-gray-500";

	const hasAdvancedSettings =
		expiryPreset !== "never" ||
		quotaEnabled ||
		allowedModels.length > 0 ||
		allowedIps.length > 0;

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title={createdKey ? t("api_keys.key") : t("api_keys.create")}
			size="lg"
		>
			{createdKey ? (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handleClose();
					}}
					className="space-y-4"
				>
					<div
						className={`rounded-xl border p-3 text-xs ${TOKENS.amber.outline}`}
					>
						⚠️ {t("api_keys.copy_warning")}
					</div>
					<div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-sm text-gray-800 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
						<span className="flex-1 break-all select-all">{createdKey}</span>
						<button
							type="button"
							onClick={() => {
								navigator.clipboard.writeText(createdKey);
								setCopied(true);
								toast.success(t("api_keys.copied"));
							}}
							className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-600"
						>
							{copied ? (
								<span className="flex items-center gap-1">
									<CheckIcon className="size-3.5" />
									{t("api_keys.copied")}
								</span>
							) : (
								<span className="flex items-center gap-1">
									<ClipboardDocumentIcon className="size-3.5" />
									{t("common.copy")}
								</span>
							)}
						</button>
					</div>
					<div className="flex justify-end">
						<Button type="submit">{t("common.confirm")}</Button>
					</div>
				</form>
			) : (
				<form onSubmit={handleSubmit} className="space-y-5">
					{/* Name */}
					<div>
						<label htmlFor="modal-key-name" className={labelCls}>
							{t("api_keys.name")}
							<span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
								({t("common.optional")})
							</span>
						</label>
						<Input
							type="text"
							id="modal-key-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="mt-1"
							placeholder={t("api_keys.name_placeholder")}
							autoFocus
						/>
					</div>

					{/* Advanced Settings Toggle */}
					<div className="border-t border-gray-100 pt-4 dark:border-white/5">
						<button
							type="button"
							onClick={() => setShowAdvanced(!showAdvanced)}
							className="flex w-full items-center justify-between text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
						>
							<span className="flex items-center gap-2">
								{t("api_keys.permissions")}
								{hasAdvancedSettings && (
									<span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
										{
											[
												expiryPreset !== "never",
												quotaEnabled,
												allowedModels.length > 0,
												allowedIps.length > 0,
											].filter(Boolean).length
										}
									</span>
								)}
							</span>
							<ChevronDownIcon
								className={`size-5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
							/>
						</button>
					</div>

					{showAdvanced && (
						<div className="space-y-5 rounded-xl border border-gray-100 bg-gray-50/50 p-4 dark:border-white/5 dark:bg-white/[0.02]">
							{/* Expiration */}
							<div>
								<span className={labelCls}>{t("api_keys.expires_at")}</span>
								<div className="mt-2 flex flex-wrap gap-1.5">
									{(
										[
											["never", t("api_keys.expires_never")],
											["7d", "7d"],
											["30d", "30d"],
											["90d", "90d"],
											["custom", t("api_keys.expiry_custom")],
										] as const
									).map(([val, label]) => (
										<button
											key={val}
											type="button"
											onClick={() => setExpiryPreset(val as ExpiryPreset)}
											className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
												expiryPreset === val
													? "bg-brand-500 text-white shadow-sm"
													: "bg-white text-gray-600 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-400 dark:ring-white/10 dark:hover:bg-white/10"
											}`}
										>
											{label}
										</button>
									))}
								</div>
								{expiryPreset === "custom" && (
									<Input
										type="datetime-local"
										value={customDate}
										onChange={(e) => setCustomDate(e.target.value)}
										className="mt-2"
										min={new Date().toISOString().slice(0, 16)}
									/>
								)}
							</div>

							{/* Quota */}
							<div>
								<div className="flex items-center justify-between">
									<span className={labelCls}>{t("api_keys.quota")}</span>
									<ToggleSwitch
										enabled={quotaEnabled}
										onChange={setQuotaEnabled}
									/>
								</div>
								{quotaEnabled && (
									<div className="mt-2">
										<div className="relative">
											<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
												$
											</span>
											<Input
												type="number"
												value={quotaLimit}
												onChange={(e) => setQuotaLimit(e.target.value)}
												className="pl-7"
												placeholder="10.00"
												step="0.01"
												min="0.01"
											/>
										</div>
										<p className={hintCls}>{t("api_keys.quota_hint")}</p>
									</div>
								)}
							</div>

							{/* Allowed Models */}
							<div>
								<span className={labelCls}>{t("api_keys.allowed_models")}</span>
								<div className="mt-2">
									<ModelMultiSelect
										value={allowedModels}
										onChange={setAllowedModels}
										placeholder={t("api_keys.allowed_models_all")}
									/>
								</div>
								<p className={hintCls}>{t("api_keys.allowed_models_hint")}</p>
							</div>

							{/* IP Allowlist */}
							<div>
								<span className={labelCls}>{t("api_keys.allowed_ips")}</span>
								<div className="mt-2">
									<IpAllowlistInput
										value={allowedIps}
										onChange={setAllowedIps}
									/>
								</div>
								<p className={hintCls}>{t("api_keys.allowed_ips_hint")}</p>
							</div>
						</div>
					)}

					<div className="flex justify-end gap-3">
						<Button variant="secondary" onClick={handleClose}>
							{t("common.cancel")}
						</Button>
						<Button type="submit">{t("common.save")}</Button>
					</div>
				</form>
			)}
		</Modal>
	);
}

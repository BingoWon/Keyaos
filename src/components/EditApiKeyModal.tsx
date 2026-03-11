import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import type { ApiKeyInfo } from "../types/api-key";
import { type ExpiryPreset, expiryToTimestamp } from "../utils/expiry";
import { toastApiError } from "../utils/toast-error";
import { IpAllowlistInput } from "./IpAllowlistInput";
import { Modal } from "./Modal";
import { ModelMultiSelect } from "./ModelMultiSelect";
import { ToggleSwitch } from "./ToggleSwitch";
import { Button, Input } from "./ui";

interface Props {
	open: boolean;
	onClose: () => void;
	apiKey: ApiKeyInfo | null;
	onUpdated: () => void;
}

export function EditApiKeyModal({ open, onClose, apiKey, onUpdated }: Props) {
	const { t } = useTranslation();
	const { getToken } = useAuth();

	const [name, setName] = useState("");
	const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("keep");
	const [customDate, setCustomDate] = useState("");
	const [quotaEnabled, setQuotaEnabled] = useState(false);
	const [quotaLimit, setQuotaLimit] = useState("");
	const [allowedModels, setAllowedModels] = useState<string[]>([]);
	const [allowedIps, setAllowedIps] = useState<string[]>([]);

	useEffect(() => {
		if (apiKey) {
			setName(apiKey.name);
			setExpiryPreset("keep");
			setCustomDate("");
			setQuotaEnabled(apiKey.quotaLimit != null);
			setQuotaLimit(apiKey.quotaLimit != null ? String(apiKey.quotaLimit) : "");
			setAllowedModels(apiKey.allowedModels ?? []);
			setAllowedIps(apiKey.allowedIps ?? []);
		}
	}, [apiKey]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!apiKey) return;
		const tid = toast.loading(t("common.loading"));

		const body: Record<string, unknown> = {};
		if (name !== apiKey.name) body.name = name;

		const newExpiry = expiryToTimestamp(expiryPreset, customDate);
		if (newExpiry !== undefined) body.expiresAt = newExpiry;

		const newQuota = quotaEnabled && quotaLimit ? Number(quotaLimit) : null;
		if (newQuota !== apiKey.quotaLimit) body.quotaLimit = newQuota;

		const modelsChanged =
			JSON.stringify([...allowedModels].sort()) !==
			JSON.stringify([...(apiKey.allowedModels ?? [])].sort());
		if (modelsChanged)
			body.allowedModels = allowedModels.length ? allowedModels : null;

		const ipsChanged =
			JSON.stringify([...allowedIps].sort()) !==
			JSON.stringify([...(apiKey.allowedIps ?? [])].sort());
		if (ipsChanged) body.allowedIps = allowedIps.length ? allowedIps : null;

		if (Object.keys(body).length === 0) {
			toast.dismiss(tid);
			onClose();
			return;
		}

		try {
			const res = await fetch(`/api/api-keys/${apiKey.id}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${await getToken()}`,
				},
				body: JSON.stringify(body),
			});
			if (res.ok) {
				toast.success(t("common.success"), { id: tid });
				onUpdated();
				onClose();
			} else {
				const data = await res.json();
				toastApiError(data, t, tid);
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"), { id: tid });
		}
	};

	if (!apiKey) return null;

	const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300";
	const hintCls = "mt-1 text-xs text-gray-400 dark:text-gray-500";

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={t("api_keys.edit_title")}
			size="lg"
		>
			<form onSubmit={handleSubmit} className="space-y-5">
				{/* Name */}
				<div>
					<label htmlFor="edit-key-name" className={labelCls}>
						{t("api_keys.name")}
					</label>
					<Input
						type="text"
						id="edit-key-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="mt-1"
						autoFocus
					/>
				</div>

				{/* Quota display */}
				{apiKey.quotaLimit != null && (
					<div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/5 dark:text-gray-400">
						<span>
							{t("api_keys.quota_used_of", {
								used: `$${apiKey.quotaUsed.toFixed(4)}`,
								limit: `$${apiKey.quotaLimit.toFixed(2)}`,
							})}
						</span>
						{apiKey.quotaUsed > 0 && (
							<button
								type="button"
								onClick={async () => {
									if (!confirm(t("api_keys.quota_reset_confirm"))) return;
									try {
										const res = await fetch(
											`/api/api-keys/${apiKey.id}/reset-quota`,
											{
												method: "POST",
												headers: {
													Authorization: `Bearer ${await getToken()}`,
												},
											},
										);
										if (res.ok) {
											toast.success(t("common.success"));
											onUpdated();
										}
									} catch {
										toast.error(t("common.error"));
									}
								}}
								className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
							>
								{t("api_keys.quota_reset")}
							</button>
						)}
					</div>
				)}

				{/* Expiration */}
				<div>
					<span className={labelCls}>{t("api_keys.expires_at")}</span>
					<p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
						{t("api_keys.current_expiry", {
							value: apiKey.expiresAt
								? new Date(apiKey.expiresAt).toLocaleString()
								: t("api_keys.expires_never"),
						})}
					</p>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{(
							[
								["keep", t("api_keys.expiry_keep")],
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
						<ToggleSwitch enabled={quotaEnabled} onChange={setQuotaEnabled} />
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
						<IpAllowlistInput value={allowedIps} onChange={setAllowedIps} />
					</div>
					<p className={hintCls}>{t("api_keys.allowed_ips_hint")}</p>
				</div>

				<div className="flex justify-end gap-3">
					<Button variant="secondary" onClick={onClose}>
						{t("common.cancel")}
					</Button>
					<Button type="submit">{t("common.save")}</Button>
				</div>
			</form>
		</Modal>
	);
}

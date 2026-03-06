import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/20/solid";
import type React from "react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { Modal } from "./Modal";
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

	const handleClose = () => {
		onClose();
		setTimeout(() => {
			setCreatedKey(null);
			setName("");
			setCopied(false);
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
				body: JSON.stringify({ name }),
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
				toast.error(result.error?.message || res.statusText, { id: tid });
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"), { id: tid });
		}
	};

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title={createdKey ? t("api_keys.key") : t("api_keys.create")}
			size="md"
		>
			{createdKey ? (
				<div className="space-y-4">
					<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-900/20 dark:text-amber-300">
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
						<Button onClick={handleClose}>{t("common.confirm")}</Button>
					</div>
				</div>
			) : (
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label
							htmlFor="modal-key-name"
							className="block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							{t("api_keys.name")}
						</label>
						<Input
							type="text"
							id="modal-key-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="mt-1"
							placeholder="e.g. Production"
							autoFocus
						/>
					</div>
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

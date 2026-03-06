import {
	Listbox,
	ListboxButton,
	ListboxOption,
	ListboxOptions,
} from "@headlessui/react";
import { ChevronUpDownIcon, KeyIcon } from "@heroicons/react/20/solid";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { useFetch } from "../hooks/useFetch";
import type { ApiKeyInfo } from "../types/api-key";
import { CreateApiKeyModal } from "./CreateApiKeyModal";
import { Button } from "./ui";

const NONE_SENTINEL = "__none__";

interface ApiKeyPickerProps {
	onChange: (plainKey: string | null) => void;
}

export function ApiKeyPicker({ onChange }: ApiKeyPickerProps) {
	const { getToken } = useAuth();
	const { t } = useTranslation();
	const { data: keys, refetch } = useFetch<ApiKeyInfo[]>("/api/api-keys");

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const revealCache = useRef(new Map<string, string>());
	const [createOpen, setCreateOpen] = useState(false);

	const enabledKeys = (keys ?? []).filter((k) => k.isEnabled);
	const selectedKey = enabledKeys.find((k) => k.id === selectedId);

	const revealAndNotify = async (id: string) => {
		const cached = revealCache.current.get(id);
		if (cached) {
			onChange(cached);
			return;
		}
		try {
			const res = await fetch(`/api/api-keys/${id}/reveal`, {
				headers: { Authorization: `Bearer ${await getToken()}` },
			});
			if (res.ok) {
				const { key } = await res.json();
				revealCache.current.set(id, key);
				onChange(key);
			} else {
				toast.error(t("common.error"));
			}
		} catch {
			toast.error(t("common.error"));
		}
	};

	const handleSelect = (val: string) => {
		if (val === NONE_SENTINEL) {
			setSelectedId(null);
			onChange(null);
			return;
		}
		setSelectedId(val);
		revealAndNotify(val);
	};

	const handleCreated = (key: {
		id: string;
		name: string;
		plainKey: string;
	}) => {
		revealCache.current.set(key.id, key.plainKey);
		setSelectedId(key.id);
		onChange(key.plainKey);
		refetch();
	};

	return (
		<div className="flex items-center gap-2">
			{enabledKeys.length > 0 && (
				<Listbox value={selectedId ?? NONE_SENTINEL} onChange={handleSelect}>
					<div className="relative">
						<ListboxButton className="relative w-72 cursor-pointer rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-8 text-left text-sm shadow-sm transition-colors hover:border-gray-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20">
							<span
								className={`block truncate ${
									selectedKey
										? "text-gray-900 dark:text-white"
										: "text-gray-400 dark:text-gray-500"
								}`}
							>
								{selectedKey?.name ?? t("api_keys.select")}
							</span>
							<span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
								<ChevronUpDownIcon className="size-4 text-gray-400" />
							</span>
						</ListboxButton>
						<ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg focus:outline-none dark:border-white/10 dark:bg-gray-800">
							<ListboxOption
								value={NONE_SENTINEL}
								className="cursor-pointer truncate px-3 py-1.5 text-gray-400 italic data-[focus]:bg-gray-50 dark:text-gray-500 dark:data-[focus]:bg-white/5"
							>
								{t("api_keys.none")}
							</ListboxOption>
							{enabledKeys.map((k) => (
								<ListboxOption
									key={k.id}
									value={k.id}
									className="cursor-pointer truncate px-3 py-1.5 text-gray-900 data-[focus]:bg-brand-50 data-[selected]:font-medium dark:text-white dark:data-[focus]:bg-white/5"
								>
									{k.name}
								</ListboxOption>
							))}
						</ListboxOptions>
					</div>
				</Listbox>
			)}

			<Button size="sm" onClick={() => setCreateOpen(true)}>
				<KeyIcon className="-ml-0.5 size-4" />
				{t("api_keys.create")}
			</Button>

			<CreateApiKeyModal
				open={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreated={handleCreated}
			/>
		</div>
	);
}

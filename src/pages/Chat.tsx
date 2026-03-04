import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import {
	Listbox,
	ListboxButton,
	ListboxOption,
	ListboxOptions,
} from "@headlessui/react";
import {
	Bars3Icon,
	ChevronUpDownIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Modality } from "../../worker/core/db/schema";
import { useAuth } from "../auth";
import { ChatThread } from "../components/chat/ChatThread";
import { ChatThreadList } from "../components/chat/ChatThreadList";
import {
	SystemPrompt,
	loadSystemPrompt,
} from "../components/chat/SystemPrompt";
import { CopyButton } from "../components/CopyButton";
import { ProviderLogo } from "../components/ProviderLogo";
import { useFetch } from "../hooks/useFetch";
import {
	useActiveThreadModel,
	useKeyaosRuntime,
	useThreadListAdapter,
} from "../hooks/useThreadRuntime";
import type { ModelEntry } from "../types/model";
import type { ProviderMeta } from "../types/provider";

const LS_MODEL_KEY = "kx-chat-model";
const LS_PROVIDER_KEY = "kx-chat-provider";
const AUTO_PROVIDER = "auto";

export function Chat() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const [modelId, setModelId] = useState(
		() => localStorage.getItem(LS_MODEL_KEY) || "",
	);
	const [providerId, setProviderId] = useState(
		() => localStorage.getItem(LS_PROVIDER_KEY) || AUTO_PROVIDER,
	);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [systemPrompt, setSystemPrompt] = useState(loadSystemPrompt);

	const activeThreadModel = useActiveThreadModel();
	useEffect(() => {
		if (activeThreadModel) setModelId(activeThreadModel);
	}, [activeThreadModel]);

	const handleModelIdChange = useCallback((v: string) => {
		setModelId(v);
		try {
			localStorage.setItem(LS_MODEL_KEY, v);
		} catch {
			/* quota exceeded – ignore */
		}
	}, []);

	const handleProviderIdChange = useCallback((v: string) => {
		setProviderId(v);
		try {
			localStorage.setItem(LS_PROVIDER_KEY, v);
		} catch {
			/* quota exceeded – ignore */
		}
	}, []);

	const getTokenRef = useRef(getToken);
	getTokenRef.current = getToken;
	const modelIdRef = useRef(modelId);
	modelIdRef.current = modelId;
	const providerIdRef = useRef(providerId);
	providerIdRef.current = providerId;
	const systemPromptRef = useRef(systemPrompt);
	systemPromptRef.current = systemPrompt;

	const getHeaders = useMemo(
		() => async () => {
			const token = await getTokenRef.current();
			return token ? { Authorization: `Bearer ${token}` } : {};
		},
		[],
	);

	const transport = useMemo(
		() =>
			new AssistantChatTransport({
				api: "/api/chat",
				body: () => ({
					model_id: modelIdRef.current,
					...(providerIdRef.current !== AUTO_PROVIDER && {
						provider_ids: [providerIdRef.current],
					}),
					...(systemPromptRef.current && {
						system: systemPromptRef.current,
					}),
				}),
				headers: getHeaders,
			}),
		[getHeaders],
	);

	const adapter = useThreadListAdapter({
		apiBase: "/api/threads",
		getHeaders,
		getModel: () => modelIdRef.current,
	});

	const runtime = useKeyaosRuntime({ transport, adapter });

	const { data: models } = useFetch<ModelEntry[]>("/api/models");
	const { data: providersMeta } = useFetch<ProviderMeta[]>("/api/providers");

	const uniqueModels = useMemo(() => {
		if (!models) return [];
		const seen = new Set<string>();
		return models.filter((m) => {
			if (seen.has(m.id)) return false;
			seen.add(m.id);
			return true;
		});
	}, [models]);

	const availableProviders = useMemo(() => {
		if (!models) return [];
		const providerIds = new Set(
			models.filter((m) => m.id === modelId).map((m) => m.provider_id),
		);
		if (!providersMeta) return [...providerIds].map((id) => ({ id, name: id, logoUrl: "" }));
		return providersMeta.filter((p) => providerIds.has(p.id));
	}, [models, modelId, providersMeta]);

	useEffect(() => {
		if (
			providerId !== AUTO_PROVIDER &&
			availableProviders.length > 0 &&
			!availableProviders.some((p) => p.id === providerId)
		) {
			handleProviderIdChange(AUTO_PROVIDER);
		}
	}, [availableProviders, providerId, handleProviderIdChange]);

	useEffect(() => {
		if (uniqueModels.length > 0 && !modelId) {
			handleModelIdChange(uniqueModels[0].id);
		}
	}, [uniqueModels, modelId, handleModelIdChange]);

	const selectedModel = useMemo(
		() => uniqueModels.find((m) => m.id === modelId),
		[uniqueModels, modelId],
	);

	const allowAttachments = useMemo(() => {
		const modalities = selectedModel?.input_modalities;
		if (!modalities) return false;
		return modalities.some((m: Modality) => m !== "text");
	}, [selectedModel]);

	if (!models) {
		return (
			<div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-10 flex h-[calc(100dvh-3.5rem)] lg:h-dvh animate-pulse">
				<div className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-gray-900/50">
					<div className="flex flex-col gap-2 p-4">
						<div className="h-9 rounded-lg bg-gray-200 dark:bg-white/10" />
						<div className="mt-4 h-4 w-3/4 rounded bg-gray-200 dark:bg-white/10" />
						<div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-white/10" />
						<div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-white/10" />
					</div>
				</div>
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-center gap-3 border-b border-gray-200 px-3 py-2 dark:border-white/10">
						<div className="size-8 rounded-lg bg-gray-200 dark:bg-white/10" />
						<div className="h-5 w-40 rounded bg-gray-200 dark:bg-white/10" />
						<div className="h-4 w-px bg-gray-200 dark:bg-white/10" />
						<div className="h-5 w-24 rounded bg-gray-200 dark:bg-white/10" />
					</div>
					<div className="flex flex-1 items-center justify-center">
						<div className="h-4 w-48 rounded bg-gray-200 dark:bg-white/10" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			<div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-10 flex h-[calc(100dvh-3.5rem)] lg:h-dvh">
				{/* Sidebar */}
				<div
					className={`shrink-0 border-r border-gray-200 bg-gray-50 transition-[width] duration-200 dark:border-white/10 dark:bg-gray-900/50 ${sidebarOpen ? "w-64" : "w-0 overflow-hidden border-r-0"}`}
				>
					<ChatThreadList />
				</div>

				{/* Main chat area */}
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-3 py-2 dark:border-white/10">
						<button
							type="button"
							onClick={() => setSidebarOpen((v) => !v)}
							className="flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
							aria-label="Toggle sidebar"
						>
							{sidebarOpen ? (
								<XMarkIcon className="size-4" />
							) : (
								<Bars3Icon className="size-4" />
							)}
						</button>
						<div className="flex items-center gap-1">
							<span className="text-xs font-medium text-gray-400 dark:text-gray-500">{t("chat.label_model")}</span>
							<ModelPicker
								models={uniqueModels}
								value={modelId}
								onChange={handleModelIdChange}
							/>
							{modelId && <CopyButton text={modelId} />}
						</div>
						<div className="h-4 w-px bg-gray-300 dark:bg-white/15" />
						<div className="flex items-center gap-1">
							<span className="text-xs font-medium text-gray-400 dark:text-gray-500">{t("chat.label_provider")}</span>
							<ProviderPicker
								providers={availableProviders}
								value={providerId}
								onChange={handleProviderIdChange}
							/>
							{providerId !== AUTO_PROVIDER && <CopyButton text={providerId} />}
						</div>
						<SystemPrompt
							value={systemPrompt}
							onChange={setSystemPrompt}
						/>
					</div>
					<div className="min-h-0 flex-1">
						<ChatThread allowAttachments={allowAttachments} />
					</div>
				</div>
			</div>
		</AssistantRuntimeProvider>
	);
}

function ModelPicker({
	models,
	value,
	onChange,
}: {
	models: ModelEntry[];
	value: string;
	onChange: (v: string) => void;
}) {
	const display = models.find((m) => m.id === value)?.name || value;

	return (
		<Listbox value={value} onChange={onChange}>
			<div className="relative">
				<ListboxButton className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-white/10">
					<span className="truncate">{display}</span>
					<ChevronUpDownIcon className="size-4 text-gray-400" />
				</ListboxButton>
				<ListboxOptions className="absolute left-0 z-20 mt-1 max-h-80 w-80 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg focus:outline-none dark:border-white/10 dark:bg-gray-800">
					{models.map((m) => (
						<ListboxOption
							key={m.id}
							value={m.id}
							className="group flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-900 data-focus:bg-brand-50 data-selected:font-medium data-selected:text-brand-700 dark:text-gray-100 dark:data-focus:bg-brand-500/15 dark:data-selected:text-brand-300"
						>
							<span className="min-w-0 flex-1 truncate">{m.name || m.id}</span>
							<CopyButton text={m.id} />
						</ListboxOption>
					))}
				</ListboxOptions>
			</div>
		</Listbox>
	);
}

function ProviderPicker({
	providers,
	value,
	onChange,
}: {
	providers: Pick<ProviderMeta, "id" | "name" | "logoUrl">[];
	value: string;
	onChange: (v: string) => void;
}) {
	const selected = providers.find((p) => p.id === value);
	const display = value === AUTO_PROVIDER ? "Auto" : selected?.name || value;

	return (
		<Listbox value={value} onChange={onChange}>
			<div className="relative">
				<ListboxButton className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-white/10">
					{selected?.logoUrl && (
						<ProviderLogo src={selected.logoUrl} name={selected.name} size={16} />
					)}
					<span className="truncate">{display}</span>
					<ChevronUpDownIcon className="size-4 text-gray-400" />
				</ListboxButton>
				<ListboxOptions className="absolute left-0 z-20 mt-1 max-h-80 w-64 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg focus:outline-none dark:border-white/10 dark:bg-gray-800">
					<ListboxOption
						value={AUTO_PROVIDER}
						className="group flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-900 data-focus:bg-brand-50 data-selected:font-medium data-selected:text-brand-700 dark:text-gray-100 dark:data-focus:bg-brand-500/15 dark:data-selected:text-brand-300"
					>
						<span className="size-4" />
						<span className="min-w-0 flex-1">Auto</span>
					</ListboxOption>
					{providers.map((p) => (
						<ListboxOption
							key={p.id}
							value={p.id}
							className="group flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-900 data-focus:bg-brand-50 data-selected:font-medium data-selected:text-brand-700 dark:text-gray-100 dark:data-focus:bg-brand-500/15 dark:data-selected:text-brand-300"
						>
							{p.logoUrl ? (
								<ProviderLogo src={p.logoUrl} name={p.name} size={16} />
							) : (
								<span className="size-4" />
							)}
							<span className="min-w-0 flex-1 truncate">{p.name}</span>
							<CopyButton text={p.id} />
						</ListboxOption>
					))}
				</ListboxOptions>
			</div>
		</Listbox>
	);
}

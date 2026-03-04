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
import type { Modality } from "../../worker/core/db/schema";
import { useAuth } from "../auth";
import { ChatThread } from "../components/chat/ChatThread";
import { ChatThreadList } from "../components/chat/ChatThreadList";
import {
	SystemPrompt,
	loadSystemPrompt,
} from "../components/chat/SystemPrompt";
import { useFetch } from "../hooks/useFetch";
import {
	useActiveThreadModel,
	useKeyaosRuntime,
	useThreadListAdapter,
} from "../hooks/useThreadRuntime";
import type { ModelEntry } from "../types/model";

const LS_MODEL_KEY = "kx-chat-model";

export function Chat() {
	const { getToken } = useAuth();
	const [model, setModel] = useState(
		() => localStorage.getItem(LS_MODEL_KEY) || "",
	);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [systemPrompt, setSystemPrompt] = useState(loadSystemPrompt);

	const activeThreadModel = useActiveThreadModel();
	useEffect(() => {
		if (activeThreadModel) setModel(activeThreadModel);
	}, [activeThreadModel]);

	const handleModelChange = useCallback((v: string) => {
		setModel(v);
		try {
			localStorage.setItem(LS_MODEL_KEY, v);
		} catch {
			/* quota exceeded – ignore */
		}
	}, []);

	const getTokenRef = useRef(getToken);
	getTokenRef.current = getToken;
	const modelRef = useRef(model);
	modelRef.current = model;
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
					model: modelRef.current,
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
	});

	const runtime = useKeyaosRuntime({ transport, adapter });

	const { data: models } = useFetch<ModelEntry[]>("/api/models");
	const uniqueModels = useMemo(() => {
		if (!models) return [];
		const seen = new Set<string>();
		return models.filter((m) => {
			if (seen.has(m.id)) return false;
			seen.add(m.id);
			return true;
		});
	}, [models]);

	useEffect(() => {
		if (uniqueModels.length > 0 && !model) {
			handleModelChange(uniqueModels[0].id);
		}
	}, [uniqueModels, model, handleModelChange]);

	const selectedModel = useMemo(
		() => uniqueModels.find((m) => m.id === model),
		[uniqueModels, model],
	);

	const allowAttachments = useMemo(() => {
		const modalities = selectedModel?.input_modalities;
		if (!modalities) return false;
		return modalities.some((m: Modality) => m !== "text");
	}, [selectedModel]);

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
					<div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-white/10">
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
						<ModelPicker
							models={uniqueModels}
							value={model}
							onChange={handleModelChange}
						/>
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
				<ListboxOptions className="absolute left-0 z-20 mt-1 max-h-80 w-72 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg focus:outline-none dark:border-white/10 dark:bg-gray-800">
					{models.map((m) => (
						<ListboxOption
							key={m.id}
							value={m.id}
							className="cursor-pointer px-3 py-2 text-sm text-gray-900 data-focus:bg-brand-50 data-selected:font-medium data-selected:text-brand-700 dark:text-gray-100 dark:data-focus:bg-brand-500/15 dark:data-selected:text-brand-300"
						>
							{m.name || m.id}
						</ListboxOption>
					))}
				</ListboxOptions>
			</div>
		</Listbox>
	);
}

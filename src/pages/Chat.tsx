import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
	AssistantChatTransport,
	useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import {
	Listbox,
	ListboxButton,
	ListboxOption,
	ListboxOptions,
} from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/24/outline";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth";
import { ChatThread } from "../components/chat/ChatThread";
import { useFetch } from "../hooks/useFetch";
import type { ModelEntry } from "../types/model";

export function Chat() {
	const { getToken } = useAuth();
	const [model, setModel] = useState("");

	const getTokenRef = useRef(getToken);
	getTokenRef.current = getToken;
	const modelRef = useRef(model);
	modelRef.current = model;

	const authFetch: typeof globalThis.fetch = useCallback(
		async (input, init) => {
			const token = await getTokenRef.current();
			const headers = new Headers(init?.headers);
			if (token) headers.set("Authorization", `Bearer ${token}`);
			if (init?.body) {
				try {
					const body = JSON.parse(init.body as string);
					body.model = modelRef.current;
					return globalThis.fetch(input, {
						...init,
						headers,
						body: JSON.stringify(body),
					});
				} catch {
					/* non-JSON body, pass through */
				}
			}
			return globalThis.fetch(input, { ...init, headers });
		},
		[],
	);

	const transport = useMemo(
		() => new AssistantChatTransport({ api: "/api/chat", fetch: authFetch }),
		[authFetch],
	);

	const runtime = useChatRuntime({ transport });

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

	if (uniqueModels.length > 0 && !model) {
		setModel(uniqueModels[0].id);
	}

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			<div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-10 flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
				<div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-2 dark:border-white/10">
					<ModelPicker
						models={uniqueModels}
						value={model}
						onChange={setModel}
					/>
				</div>
				<div className="min-h-0 flex-1">
					<ChatThread />
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

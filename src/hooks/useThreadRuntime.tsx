import {
	RuntimeAdapterProvider,
	unstable_useRemoteThreadListRuntime as useRemoteThreadListRuntime,
	useAui,
	type unstable_RemoteThreadListAdapter as RemoteThreadListAdapter,
	type GenericThreadHistoryAdapter,
	type MessageFormatAdapter,
	type MessageFormatItem,
	type MessageFormatRepository,
	type MessageStorageEntry,
	type ThreadHistoryAdapter,
} from "@assistant-ui/react";
import {
	type AssistantChatTransport,
	useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import {
	type FC,
	type ReactNode,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";

async function fetchApi<T>(
	url: string,
	headers: Record<string, string>,
	init?: RequestInit,
): Promise<T> {
	const res = await fetch(url, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...headers,
			...init?.headers,
		},
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json() as Promise<T>;
}

type AdapterOpts = {
	apiBase: string;
	getHeaders: () => Promise<Record<string, string>>;
};

function useKeyaosHistoryAdapter(
	optsRef: React.RefObject<AdapterOpts>,
): ThreadHistoryAdapter {
	const aui = useAui();

	return useMemo((): ThreadHistoryAdapter => {
		const h = () => optsRef.current.getHeaders();
		const b = () => optsRef.current.apiBase;

		return {
			async load() {
				return { messages: [] };
			},
			async append() {},
			withFormat<TMessage, TStorageFormat extends Record<string, unknown>>(
				formatAdapter: MessageFormatAdapter<TMessage, TStorageFormat>,
			): GenericThreadHistoryAdapter<TMessage> {
				return {
					async load(): Promise<MessageFormatRepository<TMessage>> {
						const remoteId = aui.threadListItem().getState().remoteId;
						if (!remoteId) return { messages: [] };

						const headers = await h();
						const data = await fetchApi<{
							messages: {
								id: string;
								role: string;
								parts: unknown[];
								createdAt: string;
							}[];
						}>(`${b()}/${remoteId}/messages`, headers);

						if (!data.messages?.length) return { messages: [] };

						let lastId: string | null = null;
						const messages: MessageFormatItem<TMessage>[] =
							data.messages.map((m) => {
								const entry: MessageStorageEntry<TStorageFormat> = {
									id: m.id,
									parent_id: lastId,
									format: formatAdapter.format,
									content: {
										role: m.role,
										parts: m.parts,
									} as unknown as TStorageFormat,
								};
								lastId = m.id;
								return formatAdapter.decode(entry);
							});

						const lastMsg = messages.at(-1);
						return {
							headId: lastMsg
								? formatAdapter.getId(lastMsg.message)
								: undefined,
							messages,
						};
					},
					async append() {},
				};
			},
		};
	}, [aui, optsRef]);
}

function buildTitleStream(title: string): ReadableStream {
	return new ReadableStream({
		start(ctrl) {
			ctrl.enqueue({
				type: "part-start",
				part: { type: "text" },
				path: [0],
			});
			ctrl.enqueue({
				type: "text-delta",
				textDelta: title,
				path: [0],
			});
			ctrl.enqueue({ type: "part-finish", path: [0] });
			ctrl.close();
		},
	});
}

export function useThreadListAdapter(opts: AdapterOpts): RemoteThreadListAdapter {
	const optsRef = useRef(opts);
	optsRef.current = opts;

	const unstable_Provider: FC<{ children: ReactNode }> = useCallback(
		function KeyaosHistoryProvider({ children }: { children: ReactNode }) {
			const history = useKeyaosHistoryAdapter(optsRef);
			const adapters = useMemo(() => ({ history }), [history]);
			return (
				<RuntimeAdapterProvider adapters={adapters}>
					{children}
				</RuntimeAdapterProvider>
			);
		},
		[],
	);

	const [adapter] = useState<RemoteThreadListAdapter>(() => {
		const h = () => optsRef.current.getHeaders();
		const b = () => optsRef.current.apiBase;

		return {
			list: async () => fetchApi(b(), await h()),
			initialize: async (threadId) => {
				return fetchApi(b(), await h(), {
					method: "POST",
					body: JSON.stringify({ threadId }),
				});
			},
			rename: async (remoteId, newTitle) => {
				await fetchApi(`${b()}/${remoteId}/rename`, await h(), {
					method: "PATCH",
					body: JSON.stringify({ title: newTitle }),
				});
			},
			archive: async (remoteId) => {
				await fetchApi(`${b()}/${remoteId}/archive`, await h(), {
					method: "PATCH",
				});
			},
			unarchive: async (remoteId) => {
				await fetchApi(`${b()}/${remoteId}/unarchive`, await h(), {
					method: "PATCH",
				});
			},
			delete: async (remoteId) => {
				await fetchApi(`${b()}/${remoteId}`, await h(), {
					method: "DELETE",
				});
			},
			generateTitle: async (remoteId, messages) => {
				const hd = await h();
				const condensed = (
					messages as {
						role: string;
						content?: { type: string; text?: string }[];
					}[]
				)
					.slice(0, 4)
					.map((m) => ({
						role: m.role,
						content: Array.isArray(m.content)
							? m.content
									.filter((p) => p.type === "text")
									.map((p) => p.text ?? "")
									.join("")
							: String(m.content ?? ""),
					}));
				try {
					const res = await fetchApi<{ title: string }>(
						`${b()}/${remoteId}/generate-title`,
						hd,
						{
							method: "POST",
							body: JSON.stringify({ messages: condensed }),
						},
					);
					return buildTitleStream(res.title);
				} catch (err) {
					console.error(
						"[generateTitle] failed for thread",
						remoteId,
						err,
					);
					return buildTitleStream("New Thread");
				}
			},
			fetch: async (threadId) => fetchApi(`${b()}/${threadId}`, await h()),
			unstable_Provider,
		};
	});

	return adapter;
}

export function useKeyaosRuntime(opts: {
	transport: AssistantChatTransport;
	adapter: RemoteThreadListAdapter;
}) {
	return useRemoteThreadListRuntime({
		runtimeHook: function RuntimeHook() {
			return useChatRuntime({ transport: opts.transport });
		},
		adapter: opts.adapter,
	});
}

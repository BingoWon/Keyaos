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
	useSyncExternalStore,
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
	getModel: () => string;
};

// ---------------------------------------------------------------------------
// Thread ↔ model binding (module-level external store)
// ---------------------------------------------------------------------------
const _modelMap = new Map<string, string>();
let _activeModel: string | null = null;
const _listeners = new Set<() => void>();

function _notify() {
	for (const cb of _listeners) cb();
}

function setActiveThreadModel(model: string | null) {
	if (model === _activeModel) return;
	_activeModel = model;
	_notify();
}

function _subscribe(cb: () => void) {
	_listeners.add(cb);
	return () => _listeners.delete(cb);
}

function _getSnapshot() {
	return _activeModel;
}

export function useActiveThreadModel(): string | null {
	return useSyncExternalStore(_subscribe, _getSnapshot);
}

// ---------------------------------------------------------------------------
// History adapter
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Streaming title helpers
// ---------------------------------------------------------------------------
function buildFallbackTitleStream(title: string): ReadableStream {
	return new ReadableStream({
		start(ctrl) {
			ctrl.enqueue({ type: "part-start", part: { type: "text" }, path: [0] });
			ctrl.enqueue({ type: "text-delta", textDelta: title, path: [0] });
			ctrl.enqueue({ type: "part-finish", path: [0] });
			ctrl.close();
		},
	});
}

function buildStreamingTitle(body: ReadableStream<Uint8Array>): ReadableStream {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	let started = false;

	return new ReadableStream({
		async start(ctrl) {
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buf += decoder.decode(value, { stream: true });
					const lines = buf.split("\n");
					buf = lines.pop()!;

					for (const line of lines) {
						if (!line.startsWith("data: ")) continue;
						const payload = line.slice(6).trim();
						if (payload === "[DONE]") continue;
						try {
							const { delta } = JSON.parse(payload);
							if (delta) {
								if (!started) {
									ctrl.enqueue({
										type: "part-start",
										part: { type: "text" },
										path: [0],
									});
									started = true;
								}
								ctrl.enqueue({
									type: "text-delta",
									textDelta: delta,
									path: [0],
								});
							}
						} catch {
							/* skip malformed SSE chunks */
						}
					}
				}

				if (!started) {
					ctrl.enqueue({
						type: "part-start",
						part: { type: "text" },
						path: [0],
					});
					ctrl.enqueue({
						type: "text-delta",
						textDelta: "New Thread",
						path: [0],
					});
				}
				ctrl.enqueue({ type: "part-finish", path: [0] });
				ctrl.close();
			} catch (err) {
				console.error("[buildStreamingTitle] stream error:", err);
				if (!started) {
					ctrl.enqueue({
						type: "part-start",
						part: { type: "text" },
						path: [0],
					});
				}
				ctrl.enqueue({
					type: "text-delta",
					textDelta: "New Thread",
					path: [0],
				});
				ctrl.enqueue({ type: "part-finish", path: [0] });
				ctrl.close();
			}
		},
	});
}

// ---------------------------------------------------------------------------
// Adapter hook
// ---------------------------------------------------------------------------
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
		const m = () => optsRef.current.getModel();

		return {
			list: async () => {
				const data = await fetchApi<{
					threads: Array<{
						remoteId: string;
						status: string;
						title?: string;
						model_id?: string;
					}>;
				}>(b(), await h());
				for (const t of data.threads) {
					if (t.model_id) _modelMap.set(t.remoteId, t.model_id);
				}
				return data;
			},
			initialize: async (threadId) => {
				setActiveThreadModel(null);
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
					const titleModel = m();
					if (!titleModel) {
						return buildFallbackTitleStream("New Thread");
					}
					const res = await fetch(
						`${b()}/${remoteId}/generate-title`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								...hd,
							},
							body: JSON.stringify({
								messages: condensed,
								model_id: titleModel,
							}),
						},
					);
					if (!res.ok || !res.body) {
						return buildFallbackTitleStream("New Thread");
					}
					return buildStreamingTitle(res.body);
				} catch (err) {
					console.error(
						"[generateTitle] failed for thread",
						remoteId,
						err,
					);
					return buildFallbackTitleStream("New Thread");
				}
			},
			fetch: async (threadId) => {
				const data = await fetchApi<{
					remoteId: string;
					status: string;
					title?: string;
					model_id?: string;
				}>(`${b()}/${threadId}`, await h());
				if (data.model_id) _modelMap.set(data.remoteId, data.model_id);
				setActiveThreadModel(
					data.model_id ?? _modelMap.get(data.remoteId) ?? null,
				);
				return data;
			},
			unstable_Provider,
		};
	});

	return adapter;
}

// ---------------------------------------------------------------------------
// Runtime hook
// ---------------------------------------------------------------------------
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

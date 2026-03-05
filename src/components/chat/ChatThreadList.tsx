import {
	ThreadListItemPrimitive,
	ThreadListPrimitive,
	useAui,
	useAuiState,
	useThreadListItemRuntime,
} from "@assistant-ui/react";
import {
	CheckIcon,
	EllipsisHorizontalIcon,
	PencilIcon,
	PencilSquareIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import {
	type FC,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	activateThreadModel,
	getThreadTimestamp,
} from "../../hooks/useThreadRuntime";

const TIME_BUCKET_KEYS = [
	"chat.time_today",
	"chat.time_yesterday",
	"chat.time_last_7_days",
	"chat.time_last_30_days",
	"chat.time_older",
] as const;

function getTimeBucket(ts: number, now: number): number {
	const todayStart = new Date(now);
	todayStart.setHours(0, 0, 0, 0);
	if (ts >= todayStart.getTime()) return 0;

	const yesterdayStart = new Date(todayStart);
	yesterdayStart.setDate(yesterdayStart.getDate() - 1);
	if (ts >= yesterdayStart.getTime()) return 1;

	const weekStart = new Date(todayStart);
	weekStart.setDate(weekStart.getDate() - 6);
	if (ts >= weekStart.getTime()) return 2;

	const monthStart = new Date(todayStart);
	monthStart.setDate(monthStart.getDate() - 29);
	if (ts >= monthStart.getTime()) return 3;

	return 4;
}

export const ChatThreadList: FC = () => {
	const { t } = useTranslation();
	return (
		<ThreadListPrimitive.Root className="flex h-full flex-col">
			<div className="flex items-center justify-between px-3 py-3">
				<h2 className="text-sm font-semibold text-gray-900 dark:text-white">
					{t("chat.threads")}
				</h2>
				<ThreadListPrimitive.New asChild>
					<button
						type="button"
						onClick={() => {
							setTimeout(() => {
								document
									.querySelector<HTMLTextAreaElement>(
										'[aria-label="Message input"]',
									)
									?.focus();
							}, 100);
						}}
						className="flex size-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
						aria-label={t("chat.new_thread")}
					>
						<PencilSquareIcon className="size-4" />
					</button>
				</ThreadListPrimitive.New>
			</div>
			<div className="flex-1 overflow-y-auto px-2 pb-2">
				<GroupedThreadItems />
			</div>
		</ThreadListPrimitive.Root>
	);
};

const GroupedThreadItems: FC = () => {
	const { t } = useTranslation();
	const aui = useAui();
	const contentLength = useAuiState((s) => s.threads.threadIds.length);
	const components = useMemo(() => ({ ThreadListItem }), []);

	const groups = useMemo(() => {
		if (contentLength === 0) return [];

		const state = aui.threads().getState();
		const now = Date.now();
		const buckets: number[][] = [[], [], [], [], []];

		for (let i = 0; i < contentLength; i++) {
			const threadId = state.threadIds[i];
			if (!threadId) continue;
			const item = state.threadItems[threadId];
			const remoteId = item?.remoteId;
			const ts = remoteId ? getThreadTimestamp(remoteId) : undefined;
			const bucket = ts ? getTimeBucket(ts, now) : 0;
			buckets[bucket]?.push(i);
		}

		return buckets
			.map((indices, bi) => ({ label: t(TIME_BUCKET_KEYS[bi] ?? ""), indices }))
			.filter((g) => g.indices.length > 0);
	}, [contentLength, aui, t]);

	if (groups.length === 0) return null;

	return (
		<>
			{groups.map((group) => (
				<div key={group.label}>
					<div className="px-2.5 pb-1 pt-3 text-xs font-medium text-gray-400 dark:text-gray-500">
						{group.label}
					</div>
					{group.indices.map((i) => (
						<ThreadListPrimitive.ItemByIndex
							key={i}
							index={i}
							components={components}
						/>
					))}
				</div>
			))}
		</>
	);
};

const ThreadListItem: FC = () => {
	const [showMenu, setShowMenu] = useState(false);
	const [isRenaming, setIsRenaming] = useState(false);
	const [draft, setDraft] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const runtime = useThreadListItemRuntime();

	const startRename = useCallback(() => {
		const current = runtime.getState().title ?? "";
		setDraft(current);
		setIsRenaming(true);
		setShowMenu(false);
	}, [runtime]);

	const confirmRename = useCallback(() => {
		const trimmed = draft.trim();
		if (trimmed) {
			runtime.rename(trimmed);
		}
		setIsRenaming(false);
	}, [draft, runtime]);

	const cancelRename = useCallback(() => {
		setIsRenaming(false);
	}, []);

	const onKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				confirmRename();
			} else if (e.key === "Escape") {
				cancelRename();
			}
		},
		[confirmRename, cancelRename],
	);

	useEffect(() => {
		if (isRenaming) inputRef.current?.focus();
	}, [isRenaming]);

	if (isRenaming) {
		return (
			<ThreadListItemPrimitive.Root className="group relative mb-0.5 flex items-center rounded-lg bg-gray-100 dark:bg-white/10">
				<div className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5">
					<input
						ref={inputRef}
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={onKeyDown}
						onBlur={confirmRename}
						className="min-w-0 flex-1 rounded bg-white px-1.5 py-0.5 text-sm text-gray-900 outline-none ring-1 ring-brand-500 dark:bg-gray-800 dark:text-white"
					/>
				</div>
				<div className="flex shrink-0 items-center gap-0.5 pr-1">
					<button
						type="button"
						onMouseDown={(e) => {
							e.preventDefault();
							confirmRename();
						}}
						className="flex size-5 items-center justify-center rounded text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10"
					>
						<CheckIcon className="size-3" />
					</button>
					<button
						type="button"
						onMouseDown={(e) => {
							e.preventDefault();
							cancelRename();
						}}
						className="flex size-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
					>
						<XMarkIcon className="size-3" />
					</button>
				</div>
			</ThreadListItemPrimitive.Root>
		);
	}

	return (
		<ThreadListItemPrimitive.Root className="group relative mb-0.5 flex items-center rounded-lg transition-colors data-active:bg-brand-50 data-active:text-brand-700 dark:data-active:bg-brand-500/15 dark:data-active:text-brand-300">
			<ThreadListItemPrimitive.Trigger
				className="flex min-w-0 flex-1 items-center overflow-hidden rounded-lg py-2 pl-2.5 pr-8 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 group-data-active:bg-transparent group-data-active:text-brand-700 dark:text-gray-300 dark:hover:bg-white/5 dark:group-data-active:text-brand-300"
				onClick={() => {
					const remoteId = runtime.getState().remoteId;
					if (remoteId) activateThreadModel(remoteId);
					setTimeout(() => {
						document
							.querySelector<HTMLTextAreaElement>(
								'[aria-label="Message input"]',
							)
							?.focus();
					}, 100);
				}}
			>
				<span className="truncate">
					<ThreadListItemPrimitive.Title fallback="New Thread" />
				</span>
			</ThreadListItemPrimitive.Trigger>
			<div className="absolute right-1 flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-data-active:opacity-100">
				<button
					type="button"
					onClick={() => setShowMenu((v) => !v)}
					className="flex size-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-300"
				>
					<EllipsisHorizontalIcon className="size-4" />
				</button>
			</div>
			{showMenu && (
				<div
					role="menu"
					className="absolute right-0 top-full z-30 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-gray-800"
					onMouseLeave={() => setShowMenu(false)}
				>
					<button
						type="button"
						onClick={startRename}
						className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
					>
						<PencilIcon className="size-3.5" />
						Rename
					</button>
					<ThreadListItemPrimitive.Delete asChild>
						<button
							type="button"
							onClick={() => setShowMenu(false)}
							className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
						>
							<TrashIcon className="size-3.5" />
							Delete
						</button>
					</ThreadListItemPrimitive.Delete>
				</div>
			)}
		</ThreadListItemPrimitive.Root>
	);
};

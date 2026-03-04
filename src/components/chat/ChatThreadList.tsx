import {
	ThreadListItemPrimitive,
	ThreadListPrimitive,
	useThreadListItemRuntime,
} from "@assistant-ui/react";
import {
	CheckIcon,
	EllipsisHorizontalIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import {
	type FC,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";

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
							console.debug("[NewThread] onClick fired");
							const el = document.querySelector<HTMLTextAreaElement>(
								'[aria-label="Message input"]',
							);
							console.debug("[NewThread] textarea found (sync):", !!el);
							if (el) {
								el.focus();
								console.debug("[NewThread] focus called (sync), activeElement:", document.activeElement?.tagName, document.activeElement === el);
							}
							requestAnimationFrame(() => {
								const el2 = document.querySelector<HTMLTextAreaElement>(
									'[aria-label="Message input"]',
								);
								console.debug("[NewThread] textarea found (rAF):", !!el2);
								if (el2) {
									el2.focus();
									console.debug("[NewThread] focus called (rAF), activeElement:", document.activeElement?.tagName, document.activeElement === el2);
								}
							});
							setTimeout(() => {
								const el3 = document.querySelector<HTMLTextAreaElement>(
									'[aria-label="Message input"]',
								);
								console.debug("[NewThread] textarea found (100ms):", !!el3);
								if (el3) {
									el3.focus();
									console.debug("[NewThread] focus called (100ms), activeElement:", document.activeElement?.tagName, document.activeElement === el3);
								}
							}, 100);
							setTimeout(() => {
								const el4 = document.querySelector<HTMLTextAreaElement>(
									'[aria-label="Message input"]',
								);
								console.debug("[NewThread] textarea found (500ms):", !!el4);
								if (el4) {
									el4.focus();
									console.debug("[NewThread] focus called (500ms), activeElement:", document.activeElement?.tagName, document.activeElement === el4);
								}
							}, 500);
						}}
						className="flex size-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
						aria-label={t("chat.new_thread")}
					>
						<PlusIcon className="size-4" />
					</button>
				</ThreadListPrimitive.New>
			</div>
			<div className="flex-1 overflow-y-auto px-2 pb-2">
				<ThreadListPrimitive.Items
					components={{ ThreadListItem }}
				/>
			</div>
		</ThreadListPrimitive.Root>
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
			<ThreadListItemPrimitive.Trigger className="flex min-w-0 flex-1 items-center rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 group-data-active:bg-transparent group-data-active:text-brand-700 dark:text-gray-300 dark:hover:bg-white/5 dark:group-data-active:text-brand-300">
				<ThreadListItemPrimitive.Title
					fallback="New Thread"
					className="truncate"
				/>
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

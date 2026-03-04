import {
	ActionBarPrimitive,
	AuiIf,
	BranchPickerPrimitive,
	ComposerPrimitive,
	ErrorPrimitive,
	MessagePrimitive,
	ThreadPrimitive,
	useMessagePartImage,
} from "@assistant-ui/react";
import {
	ArrowDownIcon,
	ArrowPathIcon,
	ArrowUpIcon,
	CheckIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ClipboardDocumentIcon,
	PaperClipIcon,
	PencilIcon,
	StopIcon,
} from "@heroicons/react/24/outline";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { classNames } from "../../utils/classNames";
import { ComposerAttachment, UserMessageAttachment } from "./ChatAttachment";
import { ChatMarkdown } from "./ChatMarkdown";

export const ChatThread: FC<{ allowAttachments?: boolean }> = ({
	allowAttachments,
}) => {
	return (
		<ThreadPrimitive.Root
			className="flex h-full flex-col bg-white dark:bg-gray-900"
			style={{ "--thread-max-width": "44rem" } as React.CSSProperties}
		>
			<ThreadPrimitive.Viewport
				turnAnchor="top"
				className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4"
			>
				<AuiIf condition={(s) => s.thread.isEmpty}>
					<ThreadWelcome />
				</AuiIf>

				<ThreadPrimitive.Messages
					components={{ UserMessage, EditComposer, AssistantMessage }}
				/>

				<ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto mt-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 overflow-visible rounded-t-3xl bg-white pb-4 dark:bg-gray-900 md:pb-6">
					<ThreadScrollToBottom />
					<Composer allowAttachments={allowAttachments} />
				</ThreadPrimitive.ViewportFooter>
			</ThreadPrimitive.Viewport>
		</ThreadPrimitive.Root>
	);
};

const ThreadScrollToBottom: FC = () => (
	<ThreadPrimitive.ScrollToBottom asChild>
		<button
			type="button"
			className="absolute -top-12 z-10 self-center rounded-full border border-gray-200 bg-white p-2 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 disabled:invisible dark:border-white/10 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
		>
			<ArrowDownIcon className="size-4" />
			<span className="sr-only">Scroll to bottom</span>
		</button>
	</ThreadPrimitive.ScrollToBottom>
);

const ThreadWelcome: FC = () => {
	const { t } = useTranslation();
	return (
		<div className="mx-auto my-auto flex w-full max-w-[var(--thread-max-width)] grow flex-col">
			<div className="flex w-full grow flex-col items-center justify-center">
				<div className="flex size-full flex-col justify-center px-4">
					<h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
						{t("chat.welcome_title")}
					</h1>
					<p className="mt-1 text-lg text-gray-500 dark:text-gray-400">
						{t("chat.welcome_subtitle")}
					</p>
				</div>
			</div>
		</div>
	);
};

const Composer: FC<{ allowAttachments?: boolean }> = ({
	allowAttachments,
}) => {
	const { t } = useTranslation();
	return (
		<ComposerPrimitive.Root className="relative flex w-full flex-col">
			<ComposerPrimitive.AttachmentDropzone className="flex w-full flex-col rounded-2xl border border-gray-200 bg-white px-1 pt-2 outline-none transition-shadow has-[textarea:focus-visible]:border-brand-500 has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-brand-500/20 data-[drop-active]:border-brand-500 data-[drop-active]:bg-brand-50/50 dark:border-white/15 dark:bg-white/5 dark:has-[textarea:focus-visible]:border-brand-400 dark:has-[textarea:focus-visible]:ring-brand-400/20 dark:data-[drop-active]:border-brand-400 dark:data-[drop-active]:bg-brand-500/10">
				<ComposerPrimitive.Attachments
					components={{ Attachment: ComposerAttachment }}
					className="flex flex-wrap gap-2 px-3 pt-2 empty:hidden"
				/>
				<ComposerPrimitive.Input
					placeholder={t("chat.placeholder")}
					className="mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus-visible:ring-0 dark:text-white dark:placeholder:text-gray-500"
					rows={1}
					autoFocus
					aria-label="Message input"
				/>
				<ComposerAction allowAttachments={allowAttachments} />
			</ComposerPrimitive.AttachmentDropzone>
		</ComposerPrimitive.Root>
	);
};

const ComposerAction: FC<{ allowAttachments?: boolean }> = ({
	allowAttachments,
}) => (
	<div className="relative mx-2 mb-2 flex items-center justify-between">
		<div>
			{allowAttachments && (
				<ComposerPrimitive.AddAttachment asChild>
					<button
						type="button"
						className="flex size-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-300"
						aria-label="Attach file"
					>
						<PaperClipIcon className="size-4" />
					</button>
				</ComposerPrimitive.AddAttachment>
			)}
		</div>
		<div>
			<AuiIf condition={(s) => !s.thread.isRunning}>
				<ComposerPrimitive.Send asChild>
					<button
						type="submit"
						className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40 dark:bg-brand-500 dark:hover:bg-brand-600"
						aria-label="Send message"
					>
						<ArrowUpIcon className="size-4" />
					</button>
				</ComposerPrimitive.Send>
			</AuiIf>
			<AuiIf condition={(s) => s.thread.isRunning}>
				<ComposerPrimitive.Cancel asChild>
					<button
						type="button"
						className="flex size-8 items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
						aria-label="Stop generating"
					>
						<StopIcon className="size-3" />
					</button>
				</ComposerPrimitive.Cancel>
			</AuiIf>
		</div>
	</div>
);

const MessageError: FC = () => (
	<MessagePrimitive.Error>
		<ErrorPrimitive.Root className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/5 dark:text-red-200">
			<ErrorPrimitive.Message className="line-clamp-2" />
		</ErrorPrimitive.Root>
	</MessagePrimitive.Error>
);

const ChatImage: FC = () => {
	const image = useMessagePartImage();
	if (!image?.url) return null;
	return (
		<img
			src={image.url}
			alt=""
			className="my-2 max-h-96 rounded-lg border border-gray-200 dark:border-white/10"
		/>
	);
};

const AssistantMessage: FC = () => (
	<MessagePrimitive.Root
		className="relative mx-auto w-full max-w-[var(--thread-max-width)] py-3"
		data-role="assistant"
	>
		<div className="px-2 leading-relaxed text-gray-900 dark:text-gray-100">
			<MessagePrimitive.Parts
				components={{ Text: ChatMarkdown, Image: ChatImage }}
			/>
			<MessageError />
		</div>
		<div className="mt-1 ml-2 flex">
			<BranchPicker />
			<AssistantActionBar />
		</div>
	</MessagePrimitive.Root>
);

const AssistantActionBar: FC = () => (
	<ActionBarPrimitive.Root
		hideWhenRunning
		autohide="not-last"
		autohideFloat="single-branch"
		className="-ml-1 flex gap-1 text-gray-400 data-floating:absolute data-floating:rounded-md data-floating:border data-floating:border-gray-200 data-floating:bg-white data-floating:p-1 data-floating:shadow-sm dark:text-gray-500 dark:data-floating:border-white/10 dark:data-floating:bg-gray-800"
	>
		<ActionBarPrimitive.Copy asChild>
			<button
				type="button"
				className="rounded-md p-1 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
			>
				<AuiIf condition={(s) => s.message.isCopied}>
					<CheckIcon className="size-4 text-green-500" />
				</AuiIf>
				<AuiIf condition={(s) => !s.message.isCopied}>
					<ClipboardDocumentIcon className="size-4" />
				</AuiIf>
				<span className="sr-only">Copy</span>
			</button>
		</ActionBarPrimitive.Copy>
		<ActionBarPrimitive.Reload asChild>
			<button
				type="button"
				className="rounded-md p-1 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
			>
				<ArrowPathIcon className="size-4" />
				<span className="sr-only">Regenerate</span>
			</button>
		</ActionBarPrimitive.Reload>
	</ActionBarPrimitive.Root>
);

const UserMessage: FC = () => (
	<MessagePrimitive.Root
		className="mx-auto grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 [&:where(>*)]:col-start-2"
		data-role="user"
	>
		<div className="relative col-start-2 min-w-0">
			<MessagePrimitive.Attachments
				components={{ Attachment: UserMessageAttachment }}
				className="mb-2 flex flex-wrap gap-2 empty:hidden"
			/>
			<div className="rounded-2xl bg-brand-50 px-4 py-2.5 text-gray-900 dark:bg-brand-500/15 dark:text-white">
				<MessagePrimitive.Parts />
			</div>
			<div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
				<UserActionBar />
			</div>
		</div>
		<BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
	</MessagePrimitive.Root>
);

const UserActionBar: FC = () => (
	<ActionBarPrimitive.Root
		hideWhenRunning
		autohide="not-last"
		className="flex flex-col items-end"
	>
		<ActionBarPrimitive.Edit asChild>
			<button
				type="button"
				className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/10"
			>
				<PencilIcon className="size-4" />
				<span className="sr-only">Edit</span>
			</button>
		</ActionBarPrimitive.Edit>
	</ActionBarPrimitive.Root>
);

const EditComposer: FC = () => {
	const { t } = useTranslation();
	return (
		<MessagePrimitive.Root className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col px-2 py-3">
			<ComposerPrimitive.Root className="ml-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-gray-100 dark:bg-white/10">
				<ComposerPrimitive.Input
					className="min-h-14 w-full resize-none bg-transparent p-4 text-sm text-gray-900 outline-none dark:text-white"
					autoFocus
				/>
				<div className="mx-3 mb-3 flex items-center gap-2 self-end">
					<ComposerPrimitive.Cancel asChild>
						<button
							type="button"
							className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-white/10"
						>
							{t("common.cancel")}
						</button>
					</ComposerPrimitive.Cancel>
					<ComposerPrimitive.Send asChild>
						<button
							type="submit"
							className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
						>
							{t("chat.update")}
						</button>
					</ComposerPrimitive.Send>
				</div>
			</ComposerPrimitive.Root>
		</MessagePrimitive.Root>
	);
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
	className,
	...rest
}) => (
	<BranchPickerPrimitive.Root
		hideWhenSingleBranch
		className={classNames(
			"mr-2 -ml-2 inline-flex items-center text-xs text-gray-400 dark:text-gray-500",
			className,
		)}
		{...rest}
	>
		<BranchPickerPrimitive.Previous asChild>
			<button
				type="button"
				className="rounded-md p-1 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
			>
				<ChevronLeftIcon className="size-4" />
				<span className="sr-only">Previous</span>
			</button>
		</BranchPickerPrimitive.Previous>
		<span className="font-medium">
			<BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
		</span>
		<BranchPickerPrimitive.Next asChild>
			<button
				type="button"
				className="rounded-md p-1 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
			>
				<ChevronRightIcon className="size-4" />
				<span className="sr-only">Next</span>
			</button>
		</BranchPickerPrimitive.Next>
	</BranchPickerPrimitive.Root>
);

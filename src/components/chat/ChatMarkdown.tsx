import "@assistant-ui/react-markdown/styles/dot.css";

import {
	type CodeHeaderProps,
	MarkdownTextPrimitive,
	unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
	useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { type FC, memo, useState } from "react";
import remarkGfm from "remark-gfm";
import { classNames } from "../../utils/classNames";

const MarkdownTextImpl = () => (
	<MarkdownTextPrimitive
		remarkPlugins={[remarkGfm]}
		className="aui-md"
		components={defaultComponents}
	/>
);

export const ChatMarkdown = memo(MarkdownTextImpl);

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
	const { isCopied, copyToClipboard } = useCopyToClipboard();

	return (
		<div className="mt-2.5 flex items-center justify-between rounded-t-lg border border-b-0 border-gray-200 bg-gray-50 px-3 py-1.5 text-xs dark:border-white/10 dark:bg-white/5">
			<span className="font-medium lowercase text-gray-500 dark:text-gray-400">
				{language}
			</span>
			<button
				type="button"
				onClick={() => code && !isCopied && copyToClipboard(code)}
				className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-300"
			>
				{isCopied ? (
					<CheckIcon className="size-3.5 text-green-500" />
				) : (
					<ClipboardDocumentIcon className="size-3.5" />
				)}
			</button>
		</div>
	);
};

function useCopyToClipboard(copiedDuration = 3000) {
	const [isCopied, setIsCopied] = useState(false);
	const copyToClipboard = (value: string) => {
		if (!value) return;
		navigator.clipboard.writeText(value).then(() => {
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), copiedDuration);
		});
	};
	return { isCopied, copyToClipboard };
}

const defaultComponents = memoizeMarkdownComponents({
	h1: ({ className, ...props }) => (
		<h1
			className={classNames(
				"mb-2 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	h2: ({ className, ...props }) => (
		<h2
			className={classNames(
				"mt-3 mb-1.5 scroll-m-20 text-sm font-semibold first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	h3: ({ className, ...props }) => (
		<h3
			className={classNames(
				"mt-2.5 mb-1 scroll-m-20 text-sm font-semibold first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	p: ({ className, ...props }) => (
		<p
			className={classNames(
				"my-2.5 leading-normal first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	a: ({ className, ...props }) => (
		<a
			className={classNames(
				"text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300",
				className,
			)}
			{...props}
		/>
	),
	blockquote: ({ className, ...props }) => (
		<blockquote
			className={classNames(
				"my-2.5 border-l-2 border-gray-300 pl-3 italic text-gray-500 dark:border-gray-600 dark:text-gray-400",
				className,
			)}
			{...props}
		/>
	),
	ul: ({ className, ...props }) => (
		<ul
			className={classNames(
				"my-2 ml-4 list-disc marker:text-gray-400 dark:marker:text-gray-500 [&>li]:mt-1",
				className,
			)}
			{...props}
		/>
	),
	ol: ({ className, ...props }) => (
		<ol
			className={classNames(
				"my-2 ml-4 list-decimal marker:text-gray-400 dark:marker:text-gray-500 [&>li]:mt-1",
				className,
			)}
			{...props}
		/>
	),
	hr: ({ className, ...props }) => (
		<hr
			className={classNames(
				"my-2 border-gray-200 dark:border-white/10",
				className,
			)}
			{...props}
		/>
	),
	table: ({ className, ...props }) => (
		<table
			className={classNames(
				"my-2 w-full border-separate border-spacing-0 overflow-y-auto",
				className,
			)}
			{...props}
		/>
	),
	th: ({ className, ...props }) => (
		<th
			className={classNames(
				"bg-gray-50 px-2 py-1 text-left font-medium first:rounded-tl-lg last:rounded-tr-lg dark:bg-white/5",
				className,
			)}
			{...props}
		/>
	),
	td: ({ className, ...props }) => (
		<td
			className={classNames(
				"border-b border-l border-gray-200 px-2 py-1 text-left last:border-r dark:border-white/10",
				className,
			)}
			{...props}
		/>
	),
	tr: ({ className, ...props }) => (
		<tr
			className={classNames(
				"m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg",
				className,
			)}
			{...props}
		/>
	),
	li: ({ className, ...props }) => (
		<li className={classNames("leading-normal", className)} {...props} />
	),
	pre: ({ className, ...props }) => (
		<pre
			className={classNames(
				"overflow-x-auto rounded-t-none rounded-b-lg border border-t-0 border-gray-200 bg-gray-50/50 p-3 text-xs leading-relaxed dark:border-white/10 dark:bg-white/[0.03]",
				className,
			)}
			{...props}
		/>
	),
	code: function Code({ className, ...props }) {
		const isCodeBlock = useIsMarkdownCodeBlock();
		return (
			<code
				className={classNames(
					!isCodeBlock &&
						"rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[0.85em] dark:border-white/10 dark:bg-white/5",
					className,
				)}
				{...props}
			/>
		);
	},
	CodeHeader,
});

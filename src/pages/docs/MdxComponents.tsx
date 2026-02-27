import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import {
	Children,
	type ComponentPropsWithoutRef,
	isValidElement,
	type ReactElement,
	useState,
} from "react";
import { Link } from "react-router-dom";

/* ── Headings ──────────────────────────────────────────── */

function makeHeading(Tag: "h1" | "h2" | "h3" | "h4") {
	return function Heading(props: ComponentPropsWithoutRef<typeof Tag>) {
		const id =
			typeof props.children === "string"
				? props.children
						.toLowerCase()
						.replace(/\s+/g, "-")
						.replace(/[^\w-]/g, "")
				: undefined;

		const styles: Record<string, string> = {
			h1: "text-2xl font-bold tracking-tight text-gray-900 dark:text-white mt-0 mb-6",
			h2: "text-xl font-semibold text-gray-900 dark:text-white mt-10 mb-4 pb-2 border-b border-gray-200 dark:border-white/10",
			h3: "text-lg font-semibold text-gray-900 dark:text-white mt-8 mb-3",
			h4: "text-base font-semibold text-gray-900 dark:text-white mt-6 mb-2",
		};

		return <Tag id={id} className={styles[Tag]} {...props} />;
	};
}

/* ── Code block with copy button ───────────────────────── */

function extractText(node: unknown): string {
	if (typeof node === "string") return node;
	if (typeof node === "number") return String(node);
	if (!isValidElement(node)) return "";
	const el = node as ReactElement<{ children?: React.ReactNode }>;
	return Children.toArray(el.props.children).map(extractText).join("");
}

function CodeBlock(props: ComponentPropsWithoutRef<"pre">) {
	const [copied, setCopied] = useState(false);

	// Extract language from child <code className="language-*">
	const child = Children.only(props.children);
	const lang =
		isValidElement(child) &&
		typeof (child as ReactElement<{ className?: string }>).props.className ===
			"string"
			? (child as ReactElement<{ className?: string }>).props.className
					?.replace("language-", "")
					.toUpperCase()
			: undefined;

	const text = extractText(props.children);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="group relative mb-4">
			{/* Header bar: language label + copy */}
			<div className="flex items-center justify-between rounded-t-lg bg-brand-950 px-4 py-1.5 dark:bg-brand-950/80">
				<span className="text-[11px] font-medium uppercase tracking-wider text-brand-300/70">
					{lang || "CODE"}
				</span>
				<button
					type="button"
					onClick={handleCopy}
					className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-brand-300/70 transition-colors hover:bg-white/10 hover:text-brand-200"
				>
					{copied ? (
						<>
							<CheckIcon className="size-3.5 text-green-400" />
							<span>Copied</span>
						</>
					) : (
						<>
							<ClipboardDocumentIcon className="size-3.5" />
							<span>Copy</span>
						</>
					)}
				</button>
			</div>
			{/* Code content */}
			<pre
				className="overflow-x-auto rounded-b-lg bg-brand-950/95 p-4 font-mono text-[13px] leading-relaxed text-gray-100 dark:bg-brand-950/60 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit"
				{...props}
			/>
		</div>
	);
}

/* ── Inline code ───────────────────────────────────────── */

function Code(props: ComponentPropsWithoutRef<"code">) {
	const isBlock = typeof props.className === "string";
	if (isBlock) {
		return <code {...props} />;
	}
	return (
		<code
			className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[13px] text-brand-800 dark:bg-brand-500/15 dark:text-brand-200"
			{...props}
		/>
	);
}

/* ── Components map ────────────────────────────────────── */

export const mdxComponents = {
	h1: makeHeading("h1"),
	h2: makeHeading("h2"),
	h3: makeHeading("h3"),
	h4: makeHeading("h4"),
	p: (props: ComponentPropsWithoutRef<"p">) => (
		<p
			className="mb-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300"
			{...props}
		/>
	),
	a: ({ href, ...props }: ComponentPropsWithoutRef<"a">) => {
		const cls =
			"font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 underline underline-offset-4 decoration-brand-500/30 hover:decoration-brand-500 transition-colors";
		if (href?.startsWith("/")) {
			return <Link to={href} className={cls} {...props} />;
		}
		return (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className={cls}
				{...props}
			/>
		);
	},
	ul: (props: ComponentPropsWithoutRef<"ul">) => (
		<ul
			className="mb-4 list-disc space-y-1 pl-6 text-sm text-gray-600 dark:text-gray-300"
			{...props}
		/>
	),
	ol: (props: ComponentPropsWithoutRef<"ol">) => (
		<ol
			className="mb-4 list-decimal space-y-1 pl-6 text-sm text-gray-600 dark:text-gray-300"
			{...props}
		/>
	),
	li: (props: ComponentPropsWithoutRef<"li">) => (
		<li className="leading-relaxed" {...props} />
	),
	strong: (props: ComponentPropsWithoutRef<"strong">) => (
		<strong
			className="font-semibold text-gray-900 dark:text-white"
			{...props}
		/>
	),
	code: Code,
	pre: CodeBlock,
	blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
		<blockquote
			className="mb-4 border-l-4 border-brand-500/40 pl-4 italic text-sm text-gray-500 dark:text-gray-400"
			{...props}
		/>
	),
	table: (props: ComponentPropsWithoutRef<"table">) => (
		<div className="mb-4 overflow-x-auto">
			<table className="w-full text-sm" {...props} />
		</div>
	),
	thead: (props: ComponentPropsWithoutRef<"thead">) => (
		<thead
			className="border-b border-gray-200 dark:border-white/10"
			{...props}
		/>
	),
	th: (props: ComponentPropsWithoutRef<"th">) => (
		<th
			className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
			{...props}
		/>
	),
	td: (props: ComponentPropsWithoutRef<"td">) => (
		<td
			className="border-b border-gray-100 px-3 py-2 text-gray-600 dark:border-white/5 dark:text-gray-300"
			{...props}
		/>
	),
	hr: () => <hr className="my-8 border-gray-200 dark:border-white/10" />,
};

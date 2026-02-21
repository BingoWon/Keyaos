import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="inline-flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
		>
			{copied ? (
				<CheckIcon className="size-4 text-green-500" />
			) : (
				<ClipboardDocumentIcon className="size-4" />
			)}
		</button>
	);
}

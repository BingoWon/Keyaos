import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";

function CopyButton({ text }: { text: string }) {
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
			className="ml-2 inline-flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
		>
			{copied ? (
				<CheckIcon className="size-4 text-green-500" />
			) : (
				<ClipboardDocumentIcon className="size-4" />
			)}
		</button>
	);
}

function CodeBlock({ label, code }: { label: string; code: string }) {
	return (
		<div>
			<dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
				{label}
			</dt>
			<dd className="mt-1 flex items-center">
				<code className="rounded bg-gray-100 px-2 py-1 text-sm font-mono text-gray-900 dark:bg-white/10 dark:text-white">
					{code}
				</code>
				<CopyButton text={code} />
			</dd>
		</div>
	);
}

export function Guide() {
	const { t } = useTranslation();
	const baseUrl = window.location.origin;

	const curlExample = `curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \\
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;

	const pythonExample = `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="YOUR_ADMIN_TOKEN",
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`;

	return (
		<div className="max-w-3xl">
			<h3 className="text-base font-semibold text-gray-900 dark:text-white">
				{t("guide.title")}
			</h3>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
				{t("guide.subtitle")}
			</p>

			<div className="mt-6 space-y-6">
				<dl className="space-y-4">
					<CodeBlock label="Base URL" code={`${baseUrl}/v1`} />
					<CodeBlock label="API Key" code="YOUR_ADMIN_TOKEN" />
				</dl>

				<div>
					<h4 className="text-sm font-medium text-gray-900 dark:text-white">
						cURL
					</h4>
					<pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100 dark:bg-white/5">
						{curlExample}
					</pre>
					<CopyButton text={curlExample} />
				</div>

				<div>
					<h4 className="text-sm font-medium text-gray-900 dark:text-white">
						Python (OpenAI SDK)
					</h4>
					<pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100 dark:bg-white/5">
						{pythonExample}
					</pre>
					<CopyButton text={pythonExample} />
				</div>
			</div>
		</div>
	);
}

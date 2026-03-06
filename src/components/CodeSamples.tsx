import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Modality } from "../../worker/core/db/schema";
import { useAuth } from "../auth";
import { ApiKeyPicker } from "./ApiKeyPicker";

/* ── Types ──────────────────────────────────────────── */

export type CodeVariant = "standard" | "reasoning" | "image";

interface CodeTab {
	label: string;
	code: string;
}

/* ── Variant detection ──────────────────────────────── */

export function detectCodeVariant(
	outputModalities: Modality[],
	supportedParams: string[],
): CodeVariant {
	if (outputModalities.includes("image")) return "image";
	if (
		supportedParams.includes("include_reasoning") ||
		supportedParams.includes("reasoning")
	)
		return "reasoning";
	return "standard";
}

/* ── Code templates ─────────────────────────────────── */

const API = "https://keyaos.com/v1";
const TAB_KEY = "keyaos-code-tab";

function getInitialTab(): number {
	try {
		return Number(localStorage.getItem(TAB_KEY)) || 0;
	} catch {
		return 0;
	}
}

/* ·· Standard (text-only, no reasoning) ·············· */

function standardTabs(m: string): CodeTab[] {
	return [
		{
			label: "openai-python",
			code: `from openai import OpenAI

client = OpenAI(
    base_url="${API}",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="${m}",
    messages=[
        {"role": "user", "content": "Explain quantum computing in one sentence."}
    ],
)
print(response.choices[0].message.content)`,
		},
		{
			label: "python",
			code: `import requests

response = requests.post(
    "${API}/chat/completions",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={
        "model": "${m}",
        "messages": [
            {"role": "user", "content": "Explain quantum computing in one sentence."}
        ],
    },
)
print(response.json()["choices"][0]["message"]["content"])`,
		},
		{
			label: "typescript",
			code: `const res = await fetch("${API}/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${m}",
    messages: [
      { role: "user", content: "Explain quantum computing in one sentence." },
    ],
  }),
});

const data = await res.json();
console.log(data.choices[0].message.content);`,
		},
		{
			label: "openai-typescript",
			code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${API}",
  apiKey: "YOUR_API_KEY",
});

const response = await client.chat.completions.create({
  model: "${m}",
  messages: [
    { role: "user", content: "Explain quantum computing in one sentence." },
  ],
});

console.log(response.choices[0].message.content);`,
		},
		{
			label: "curl",
			code: `curl ${API}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $KEYAOS_API_KEY" \\
  -d '{
    "model": "${m}",
    "messages": [
      {"role": "user", "content": "Explain quantum computing in one sentence."}
    ]
  }'`,
		},
	];
}

/* ·· Reasoning ······································· */

function reasoningTabs(m: string): CodeTab[] {
	return [
		{
			label: "openai-python",
			code: `from openai import OpenAI

client = OpenAI(
    base_url="${API}",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="${m}",
    messages=[
        {"role": "user", "content": "How many prime numbers are between 1 and 50?"}
    ],
    extra_body={"reasoning": {"enabled": True}},
)

message = response.choices[0].message
print(message.content)`,
		},
		{
			label: "python",
			code: `import requests

response = requests.post(
    "${API}/chat/completions",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={
        "model": "${m}",
        "messages": [
            {"role": "user", "content": "How many prime numbers are between 1 and 50?"}
        ],
        "reasoning": {"enabled": True},
    },
)
print(response.json()["choices"][0]["message"]["content"])`,
		},
		{
			label: "typescript",
			code: `const res = await fetch("${API}/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${m}",
    messages: [
      { role: "user", content: "How many prime numbers are between 1 and 50?" },
    ],
    reasoning: { enabled: true },
  }),
});

const data = await res.json();
console.log(data.choices[0].message.content);`,
		},
		{
			label: "openai-typescript",
			code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${API}",
  apiKey: "YOUR_API_KEY",
});

const response = await client.chat.completions.create({
  model: "${m}",
  messages: [
    { role: "user", content: "How many prime numbers are between 1 and 50?" },
  ],
  reasoning: { enabled: true },
});

console.log(response.choices[0].message.content);`,
		},
		{
			label: "curl",
			code: `curl ${API}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $KEYAOS_API_KEY" \\
  -d '{
    "model": "${m}",
    "messages": [
      {"role": "user", "content": "How many prime numbers are between 1 and 50?"}
    ],
    "reasoning": {"enabled": true}
  }'`,
		},
	];
}

/* ·· Image generation ································ */

function imageTabs(m: string): CodeTab[] {
	return [
		{
			label: "openai-python",
			code: `from openai import OpenAI

client = OpenAI(
    base_url="${API}",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="${m}",
    messages=[
        {"role": "user", "content": "A serene Japanese garden with cherry blossoms at sunset"}
    ],
    extra_body={"modalities": ["image", "text"]},
)

# Response includes generated images as base64 data URLs
print(response.choices[0].message.content)`,
		},
		{
			label: "python",
			code: `import requests

response = requests.post(
    "${API}/chat/completions",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={
        "model": "${m}",
        "messages": [
            {"role": "user", "content": "A serene Japanese garden with cherry blossoms at sunset"}
        ],
        "modalities": ["image", "text"],
    },
)

data = response.json()
message = data["choices"][0]["message"]
for img in message.get("images", []):
    print(f"Generated: {img['image_url']['url'][:80]}...")`,
		},
		{
			label: "typescript",
			code: `const res = await fetch("${API}/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${m}",
    messages: [
      { role: "user", content: "A serene Japanese garden with cherry blossoms at sunset" },
    ],
    modalities: ["image", "text"],
  }),
});

const data = await res.json();
for (const img of data.choices[0].message.images ?? []) {
  console.log("Generated:", img.image_url.url.slice(0, 80));
}`,
		},
		{
			label: "openai-typescript",
			code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${API}",
  apiKey: "YOUR_API_KEY",
});

const response = await client.chat.completions.create({
  model: "${m}",
  messages: [
    { role: "user", content: "A serene Japanese garden with cherry blossoms at sunset" },
  ],
  modalities: ["image", "text"],
});

// Response includes generated images as base64 data URLs
console.log(response.choices[0].message.content);`,
		},
		{
			label: "curl",
			code: `curl ${API}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $KEYAOS_API_KEY" \\
  -d '{
    "model": "${m}",
    "messages": [
      {"role": "user", "content": "A serene Japanese garden with cherry blossoms at sunset"}
    ],
    "modalities": ["image", "text"]
  }'`,
		},
	];
}

/* ── Snippet dispatcher ─────────────────────────────── */

function getSnippets(modelId: string, variant: CodeVariant): CodeTab[] {
	switch (variant) {
		case "reasoning":
			return reasoningTabs(modelId);
		case "image":
			return imageTabs(modelId);
		default:
			return standardTabs(modelId);
	}
}

/* ── Intro text per variant ─────────────────────────── */

const INTRO: Record<CodeVariant, string> = {
	standard:
		"Keyaos provides an OpenAI-compatible API. Use any standard SDK — just point it to our base URL and start building.",
	reasoning:
		"This model supports chain-of-thought reasoning. Enable the reasoning parameter to access the model's step-by-step thinking process alongside the final answer.",
	image:
		'This model supports image generation. Set modalities to ["image", "text"] to receive generated images as base64 data URLs in the response.',
};

/* ── API key placeholder replacement ────────────────── */

function applyApiKey(code: string, apiKey: string | null): string {
	if (!apiKey) return code;
	return code
		.replace(/YOUR_API_KEY/g, apiKey)
		.replace(/\$KEYAOS_API_KEY/g, apiKey);
}

/* ── Component ──────────────────────────────────────── */

interface CodeSamplesProps {
	modelId: string;
	variant: CodeVariant;
}

export function CodeSamples({ modelId, variant }: CodeSamplesProps) {
	const { t } = useTranslation();
	const { isSignedIn } = useAuth();
	const tabs = getSnippets(modelId, variant);
	const [activeIndex, setActiveIndex] = useState(getInitialTab);
	const [copied, setCopied] = useState(false);
	const [apiKey, setApiKey] = useState<string | null>(null);

	const handleTabChange = (index: number) => {
		setActiveIndex(index);
		setCopied(false);
		try {
			localStorage.setItem(TAB_KEY, String(index));
		} catch {}
	};

	const handleCopy = async () => {
		await navigator.clipboard.writeText(
			applyApiKey(tabs[activeIndex].code, apiKey),
		);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<section>
			<h2 className="text-lg font-semibold text-gray-900 dark:text-white">
				{t("models.api_integration", "API Integration")}
			</h2>
			<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
				{t(`models.code_intro_${variant}`, INTRO[variant])}
			</p>

			{isSignedIn && (
				<div className="mt-4 mb-4">
					<ApiKeyPicker onChange={setApiKey} />
				</div>
			)}

			<TabGroup selectedIndex={activeIndex} onChange={handleTabChange}>
				<div className="overflow-hidden rounded-xl">
					<div className="flex items-center justify-between bg-brand-950 px-2 py-1.5 dark:bg-brand-950/80">
						<TabList className="flex gap-1 overflow-x-auto">
							{tabs.map((tab) => (
								<Tab
									key={tab.label}
									className={({ selected }) =>
										`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium outline-none transition-colors ${
											selected
												? "bg-white/10 text-white"
												: "text-gray-400 hover:text-gray-200"
										}`
									}
								>
									{tab.label}
								</Tab>
							))}
						</TabList>
						<button
							type="button"
							onClick={handleCopy}
							className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
						>
							{copied ? (
								<>
									<CheckIcon className="size-3.5 text-green-400" />
									<span>{t("api_keys.copied")}</span>
								</>
							) : (
								<>
									<ClipboardDocumentIcon className="size-3.5" />
									<span>{t("common.copy")}</span>
								</>
							)}
						</button>
					</div>

					<TabPanels>
						{tabs.map((tab) => (
							<TabPanel key={tab.label}>
								<pre className="overflow-x-auto bg-brand-950/95 p-4 font-mono text-[13px] leading-relaxed text-gray-100 dark:bg-brand-950/60">
									<code>{applyApiKey(tab.code, apiKey)}</code>
								</pre>
							</TabPanel>
						))}
					</TabPanels>
				</div>
			</TabGroup>

			<p className="mt-3 text-sm">
				<Link
					to="/docs/quickstart"
					className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
				>
					{t("models.view_api_docs", "View full API documentation")} &rarr;
				</Link>
			</p>
		</section>
	);
}

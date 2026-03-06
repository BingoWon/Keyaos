/**
 * Organization metadata for model brand display.
 *
 * The org slug is extracted from model IDs: "openai/gpt-4" → "openai".
 * Logos live at /logos/{slug}.png (128px favicons).
 * Unknown orgs gracefully fall back to a letter avatar.
 */

const ORG_NAMES: Record<string, string> = {
	openai: "OpenAI",
	google: "Google",
	anthropic: "Anthropic",
	"meta-llama": "Meta",
	deepseek: "DeepSeek",
	mistralai: "Mistral",
	"x-ai": "xAI",
	amazon: "Amazon",
	microsoft: "Microsoft",
	nvidia: "NVIDIA",
	cohere: "Cohere",
	ai21: "AI21",
	baidu: "Baidu",
	qwen: "Qwen",
	minimax: "MiniMax",
	bytedance: "ByteDance",
	"bytedance-seed": "ByteDance Seed",
	tencent: "Tencent",
	xiaomi: "Xiaomi",
	perplexity: "Perplexity",
	inception: "Inception",
	writer: "Writer",
	inflection: "Inflection",
	stepfun: "StepFun",
	moonshotai: "MoonshotAI",
	upstage: "Upstage",
	nousresearch: "Nous",
	eleutherai: "EleutherAI",
	allenai: "AllenAI",
	"arcee-ai": "Arcee AI",
	liquid: "LiquidAI",
	"ibm-granite": "IBM",
	deepcogito: "Deep Cogito",
	essentialai: "EssentialAI",
	kwaipilot: "Kwaipilot",
	meituan: "Meituan",
	morph: "Morph",
	"nex-agi": "Nex AGI",
	opengvlab: "OpenGVLab",
	"prime-intellect": "Prime Intellect",
	relace: "Relace",
	tngtech: "TNG",
	"z-ai": "Z.ai",
	"aion-labs": "AionLabs",
	cognitivecomputations: "Venice",
	openrouter: "OpenRouter",
	alibaba: "Alibaba",
	mancer: "Mancer",
	alfredpros: "AlfredPros",
	sao10k: "Sao10K",
	thedrummer: "TheDrummer",
	neversleep: "NeverSleep",
	alpindale: "Alpindale",
	"anthracite-org": "Anthracite",
	gryphe: "Gryphe",
	raifle: "Raifle",
	switchpoint: "Switchpoint",
	undi95: "Undi95",
};

export function getOrgSlug(modelId: string): string {
	return modelId.split("/")[0];
}

export function getOrgName(slug: string): string {
	return ORG_NAMES[slug] ?? slug;
}

export function getOrgLogoUrl(slug: string): string {
	return `/logos/${slug}.png`;
}

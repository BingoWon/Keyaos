import {
	ArrowPathIcon,
	EllipsisVerticalIcon,
	PencilSquareIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { type ReactNode, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ThemeToggle } from "../components/ThemeToggle";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { Badge, Button, Card, IconButton, Input } from "../components/ui";
import { TOKEN_NAMES, TOKENS, type TokenName } from "../utils/colors";

/* ── Color palette config (single source of truth is globals.css) ── */

const SHADES = [
	"50",
	"100",
	"200",
	"300",
	"400",
	"500",
	"600",
	"700",
	"800",
	"900",
	"950",
] as const;

interface PaletteConfig {
	name: string;
	prefix: string;
	labels: Partial<Record<string, string>>;
}

const PALETTES: PaletteConfig[] = [
	{ name: "Brand Purple", prefix: "brand", labels: { "600": "Logo" } },
	{ name: "Accent Gold", prefix: "accent", labels: { "400": "Logo" } },
];

const TOKEN_USAGE: Record<TokenName, string> = {
	sky: "Filter: Input Modalities",
	violet: "auto-topup category",
	teal: "Filter: Provider, grant category",
	amber: "Filter: Output Modalities, warnings, info boxes",
	rose: "Filter: Organization",
	red: "Error, destructive, negative amounts, delete actions",
	green: "Filter: Context Length, success, positive amounts, confirmations",
	yellow: "Warning, pending status",
	blue: "Info, cooldown, top-up category",
};

/* ── Helpers ─────────────────────────────────────────────── */

function copy(text: string) {
	navigator.clipboard.writeText(text).catch(() => {});
	toast(`Copied ${text}`, { duration: 1200 });
}

function readCssVar(name: string): string {
	return getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
}

/* ── Sub-components ──────────────────────────────────────── */

function Section({
	title,
	desc,
	children,
}: {
	title: string;
	desc: string;
	children: ReactNode;
}) {
	return (
		<section>
			<h2 className="text-xl font-semibold text-gray-900 dark:text-white">
				{title}
			</h2>
			<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{desc}</p>
			<div className="mt-6">{children}</div>
		</section>
	);
}

function Swatch({
	shade,
	prefix,
	label,
}: {
	shade: string;
	prefix: string;
	label?: string;
}) {
	const isLight = Number.parseInt(shade, 10) <= 200;
	const ref = useRef<HTMLDivElement>(null);
	const [hex, setHex] = useState("");

	useEffect(() => {
		setHex(readCssVar(`--color-${prefix}-${shade}`));
	}, [prefix, shade]);

	return (
		<button
			type="button"
			onClick={() => hex && copy(hex)}
			className="group text-left"
			title={hex ? `Copy ${hex}` : undefined}
		>
			<div
				ref={ref}
				className="flex h-12 items-start rounded-lg border border-black/5 ring-0 transition-all group-hover:ring-2 group-hover:ring-brand-500/40 dark:border-white/10"
				style={{ backgroundColor: `var(--color-${prefix}-${shade})` }}
			>
				{label && (
					<span
						className={`ml-1.5 mt-1 rounded px-1 text-[9px] font-bold uppercase tracking-wide ${isLight ? "text-brand-600" : "text-white/80"}`}
					>
						{label}
					</span>
				)}
			</div>
			<p className="mt-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
				{shade}
			</p>
			<p className="font-mono text-[10px] text-gray-400 dark:text-gray-500">
				{hex}
			</p>
		</button>
	);
}

function ColorScale({ name, prefix, labels }: PaletteConfig) {
	return (
		<div>
			<div className="mb-3 flex items-center gap-2">
				<h3 className="text-sm font-semibold text-gray-900 dark:text-white">
					{name}
				</h3>
				<span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-500 dark:bg-white/10 dark:text-gray-400">
					{prefix}-*
				</span>
			</div>
			<div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-11">
				{SHADES.map((shade) => (
					<Swatch
						key={shade}
						shade={shade}
						prefix={prefix}
						label={labels[shade]}
					/>
				))}
			</div>
		</div>
	);
}

function SubLabel({ children }: { children: ReactNode }) {
	return (
		<p className="mb-4 text-sm font-medium text-gray-700 dark:text-gray-300">
			{children}
		</p>
	);
}

function ToggleShowcase() {
	const [a, setA] = useState(true);
	const [b, setB] = useState(false);
	return (
		<div className="flex flex-wrap items-center gap-6">
			<ToggleSwitch enabled={a} onChange={setA} label="Enabled" />
			<ToggleSwitch enabled={b} onChange={setB} label="Auto-sync" />
		</div>
	);
}

/* ── Page ────────────────────────────────────────────────── */

export function DesignSystem() {
	return (
		<div className="min-h-screen bg-white transition-colors dark:bg-gray-950">
			{/* Theme toggle */}
			<div className="fixed right-4 top-4 z-10">
				<ThemeToggle />
			</div>

			{/* ── Hero ───────────────────────────────────── */}
			<header className="relative overflow-hidden border-b border-gray-200 dark:border-white/10">
				<div className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-brand-500/10 blur-3xl" />
				<div className="pointer-events-none absolute right-0 top-20 h-[400px] w-[400px] rounded-full bg-accent-400/5 blur-3xl" />

				<div className="relative mx-auto max-w-6xl px-6 py-16 lg:py-20">
					<div className="flex items-center gap-4">
						<img
							src="/logo.png"
							className="h-14 w-14 rounded-2xl"
							alt="Keyaos"
						/>
						<div>
							<h1 className="bg-gradient-to-r from-brand-500 to-accent-400 bg-clip-text text-3xl font-bold text-transparent lg:text-4xl">
								Keyaos
							</h1>
							<p className="text-sm tracking-widest text-gray-400 dark:text-gray-500">
								氪钥枢
							</p>
						</div>
					</div>
					<div className="mt-8 max-w-2xl">
						<h2 className="text-xl font-semibold text-gray-900 dark:text-white">
							Design System
						</h2>
						<p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
							Brand identity, color palette, typography, and reusable UI
							components derived from the Keyaos logo. Click any color swatch to
							copy its hex value.
						</p>
					</div>
				</div>
			</header>

			{/* ── Main ───────────────────────────────────── */}
			<main className="mx-auto max-w-6xl space-y-20 px-6 py-12">
				{/* Colors */}
				<Section
					title="Color Palette"
					desc="Purple energy and golden key — the two brand anchors."
				>
					<div className="space-y-10">
						{PALETTES.map((p) => (
							<ColorScale key={p.prefix} {...p} />
						))}
					</div>
				</Section>

				{/* Semantic Colors */}
				<Section
					title="Semantic Colors"
					desc="Nine global color tokens (src/utils/colors.ts). Every colored UI element consumes from this system."
				>
					<div className="grid gap-4 md:grid-cols-2">
						{TOKEN_NAMES.map((name) => {
							const t = TOKENS[name];
							return (
								<div
									key={name}
									className="rounded-xl border border-gray-200 p-4 dark:border-white/10"
								>
									<div className="mb-3 flex flex-wrap items-center gap-2">
										<h3 className="text-sm font-semibold capitalize text-gray-900 dark:text-white">
											{name}
										</h3>
										<span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-500 dark:bg-white/10 dark:text-gray-400">
											{name}
										</span>
										<span className="text-xs text-gray-400 dark:text-gray-500">
											— {TOKEN_USAGE[name]}
										</span>
									</div>
									<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
										{(
											[
												["solid", t.solid],
												["soft", t.soft],
												["outline", `border ${t.outline}`],
												["text", t.text],
												["control", t.control],
											] as const
										).map(([label, cls]) => (
											<div
												key={label}
												className={`flex items-center justify-center rounded-lg px-3 py-2.5 text-xs font-medium ${cls}`}
											>
												{label}
											</div>
										))}
									</div>
								</div>
							);
						})}
					</div>
				</Section>

				{/* Gradients */}
				<Section
					title="Gradients"
					desc="Surface treatments and brand gradients for dark UI."
				>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="overflow-hidden rounded-xl border border-white/10">
							<div
								className="h-32"
								style={{
									background: [
										"radial-gradient(circle at 25% 20%, color-mix(in srgb, var(--color-brand-600) 25%, transparent), transparent 55%)",
										"radial-gradient(circle at 80% 75%, color-mix(in srgb, var(--color-accent-400) 18%, transparent), transparent 55%)",
										"linear-gradient(180deg, color-mix(in srgb, var(--color-brand-950) 92%, transparent), color-mix(in srgb, var(--color-brand-950) 78%, transparent))",
									].join(", "),
								}}
							/>
							<div className="bg-gray-950 px-4 py-3">
								<p className="text-xs font-medium text-gray-300">
									Surface Gradient
								</p>
								<p className="mt-0.5 font-mono text-[10px] text-gray-500">
									brand + accent radial on dark surface
								</p>
							</div>
						</div>
						<div className="overflow-hidden rounded-xl border border-white/10">
							<div className="h-32 bg-gradient-to-br from-brand-600 via-brand-500 to-accent-400" />
							<div className="bg-gray-950 px-4 py-3">
								<p className="text-xs font-medium text-gray-300">
									Brand Gradient
								</p>
								<p className="mt-0.5 font-mono text-[10px] text-gray-500">
									to-br from-brand-600 via-brand-500 to-accent-400
								</p>
							</div>
						</div>
					</div>
				</Section>

				{/* Typography */}
				<Section
					title="Typography"
					desc="System font stack with a clear size hierarchy."
				>
					<Card>
						<dl className="space-y-6">
							{(
								[
									[
										"text-3xl / bold",
										"text-3xl font-bold text-gray-900 dark:text-white",
										"The quick brown fox",
									],
									[
										"text-xl / semibold",
										"text-xl font-semibold text-gray-900 dark:text-white",
										"The quick brown fox jumps over the lazy dog",
									],
									[
										"text-base / medium",
										"text-base font-medium text-gray-900 dark:text-white",
										"The quick brown fox jumps over the lazy dog",
									],
									[
										"text-sm",
										"text-sm text-gray-600 dark:text-gray-300",
										"The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.",
									],
									[
										"text-xs / muted",
										"text-xs text-gray-500 dark:text-gray-400",
										"The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.",
									],
									[
										"mono",
										"font-mono text-sm text-gray-600 dark:text-gray-300",
										'const gateway = "https://keyaos.dev/v1";',
									],
								] as const
							).map(([label, cls, text]) => (
								<div key={label}>
									<dt className="mb-1 font-mono text-[10px] text-gray-400 dark:text-gray-500">
										{label}
									</dt>
									<dd className={cls}>{text}</dd>
								</div>
							))}
						</dl>
					</Card>
				</Section>

				{/* Buttons */}
				<Section
					title="Buttons"
					desc="Five variants, three sizes, disabled state."
				>
					<div className="space-y-6">
						<Card>
							<SubLabel>Variants</SubLabel>
							<div className="flex flex-wrap items-center gap-3">
								<Button variant="primary">Primary</Button>
								<Button variant="secondary">Secondary</Button>
								<Button variant="ghost">Ghost</Button>
								<Button variant="accent">Accent</Button>
								<Button variant="destructive">Destructive</Button>
							</div>
						</Card>
						<Card>
							<SubLabel>Sizes</SubLabel>
							<div className="flex flex-wrap items-center gap-3">
								<Button size="sm">Small</Button>
								<Button size="md">Medium</Button>
								<Button size="lg">Large</Button>
							</div>
						</Card>
						<Card>
							<SubLabel>Disabled</SubLabel>
							<div className="flex flex-wrap items-center gap-3">
								<Button disabled>Primary</Button>
								<Button variant="secondary" disabled>
									Secondary
								</Button>
								<Button variant="accent" disabled>
									Accent
								</Button>
							</div>
						</Card>
					</div>
				</Section>

				{/* Inputs */}
				<Section
					title="Inputs"
					desc="Form inputs with focus ring and disabled state."
				>
					<Card>
						<div className="max-w-md space-y-4">
							<Input placeholder="Default input" />
							<Input placeholder="Disabled input" disabled />
							<div className="flex gap-3">
								<Input placeholder="Search models…" />
								<Button>Search</Button>
							</div>
						</div>
					</Card>
				</Section>

				{/* Badges */}
				<Section title="Badges" desc="Inline status indicators and labels.">
					<Card>
						<div className="flex flex-wrap items-center gap-3">
							<Badge>Default</Badge>
							<Badge variant="brand">Brand</Badge>
							<Badge variant="accent">Accent</Badge>
							<Badge variant="success">Success</Badge>
							<Badge variant="warning">Warning</Badge>
							<Badge variant="error">Error</Badge>
							<Badge variant="info">Info</Badge>
						</div>
					</Card>
				</Section>

				{/* Icon Buttons */}
				<Section
					title="Icon Buttons"
					desc="Compact buttons for toolbars and table actions."
				>
					<Card>
						<div className="space-y-6">
							<div>
								<SubLabel>Ghost (default)</SubLabel>
								<div className="flex items-center gap-2">
									<IconButton label="Edit">
										<PencilSquareIcon />
									</IconButton>
									<IconButton label="Delete">
										<TrashIcon />
									</IconButton>
									<IconButton label="Refresh">
										<ArrowPathIcon />
									</IconButton>
									<IconButton label="More">
										<EllipsisVerticalIcon />
									</IconButton>
									<IconButton label="Close">
										<XMarkIcon />
									</IconButton>
								</div>
							</div>
							<div>
								<SubLabel>Subtle (with hover background)</SubLabel>
								<div className="flex items-center gap-2">
									<IconButton variant="subtle" label="Edit">
										<PencilSquareIcon />
									</IconButton>
									<IconButton variant="subtle" label="Delete">
										<TrashIcon />
									</IconButton>
									<IconButton variant="subtle" label="Refresh">
										<ArrowPathIcon />
									</IconButton>
								</div>
							</div>
							<div>
								<SubLabel>Sizes</SubLabel>
								<div className="flex items-center gap-3">
									<div className="flex items-center gap-1">
										<IconButton size="sm" label="Small edit">
											<PencilSquareIcon />
										</IconButton>
										<span className="ml-1 text-xs text-gray-400">sm</span>
									</div>
									<div className="flex items-center gap-1">
										<IconButton size="md" variant="subtle" label="Medium edit">
											<PencilSquareIcon />
										</IconButton>
										<span className="ml-1 text-xs text-gray-400">md</span>
									</div>
								</div>
							</div>
						</div>
					</Card>
				</Section>

				{/* Toggle */}
				<Section title="Toggle" desc="On/off switch with brand color.">
					<Card>
						<ToggleShowcase />
					</Card>
				</Section>

				{/* Cards */}
				<Section
					title="Cards"
					desc="Container components with border and shadow."
				>
					<div className="grid gap-4 md:grid-cols-2">
						<Card>
							<h3 className="text-base font-semibold text-gray-900 dark:text-white">
								Default Card
							</h3>
							<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
								Standard container with subtle border and shadow. Adapts to
								light and dark modes automatically.
							</p>
						</Card>
						<Card className="border-brand-200 dark:border-brand-800/50">
							<div className="flex items-start justify-between gap-4">
								<div>
									<h3 className="text-base font-semibold text-gray-900 dark:text-white">
										Brand Card
									</h3>
									<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
										With brand-colored border accent.
									</p>
								</div>
								<Badge variant="brand">Pro</Badge>
							</div>
						</Card>
					</div>
				</Section>

				{/* Brand Gradient */}
				<Section
					title="Brand Gradient"
					desc="Signature diagonal gradient for hero sections and emphasis."
				>
					<div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-500 to-accent-400 px-8 py-14 text-center">
						<p className="text-sm font-medium uppercase tracking-wide text-white/70">
							AI API Gateway
						</p>
						<p className="mt-2 text-3xl font-bold text-white">Order in Chaos</p>
						<p className="mt-2 text-sm text-white/60">
							Route to the cheapest provider, automatically.
						</p>
						<div className="mt-8 flex justify-center gap-3">
							<button
								type="button"
								className="inline-flex h-9 items-center rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/20"
							>
								Documentation
							</button>
							<button
								type="button"
								className="inline-flex h-9 items-center rounded-lg bg-white px-4 text-sm font-medium text-brand-600 transition-colors hover:bg-white/90"
							>
								Get Started
							</button>
						</div>
					</div>
				</Section>

				{/* Composition */}
				<Section
					title="Composition"
					desc="Components working together in a realistic layout."
				>
					<Card>
						<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div className="space-y-3">
								<div className="flex items-center gap-2">
									<h3 className="text-base font-semibold text-gray-900 dark:text-white">
										google/gemini-2.5-flash
									</h3>
									<Badge variant="success">Active</Badge>
								</div>
								<p className="text-sm text-gray-500 dark:text-gray-400">
									Fastest Gemini model. 1M context window, multimodal input,
									streaming output.
								</p>
								<div className="flex flex-wrap gap-2">
									<Badge variant="brand">OpenRouter</Badge>
									<Badge variant="accent">$0.15 / 1M input</Badge>
									<Badge>1,048,576 ctx</Badge>
								</div>
							</div>
							<div className="flex shrink-0 gap-2">
								<Button variant="ghost" size="sm">
									Details
								</Button>
								<Button size="sm">Route</Button>
							</div>
						</div>
					</Card>
				</Section>
			</main>

			{/* ── Footer ─────────────────────────────────── */}
			<footer className="border-t border-gray-200 py-8 text-center dark:border-white/10">
				<p className="text-xs text-gray-400 dark:text-gray-500">
					Keyaos Design System
				</p>
			</footer>
		</div>
	);
}

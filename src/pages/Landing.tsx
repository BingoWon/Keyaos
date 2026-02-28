import { UserButton } from "@clerk/clerk-react";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import {
	BoltIcon,
	BookOpenIcon,
	CodeBracketIcon,
	CommandLineIcon,
	GlobeAltIcon,
	HeartIcon,
	KeyIcon,
	SignalIcon,
	UserGroupIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { isPlatform, useAuth } from "../auth";
import { LanguageSelector } from "../components/LanguageSelector";
import { ThemeToggle } from "../components/ThemeToggle";

const PROVIDERS = [
	{
		name: "OpenRouter",
		logo: "https://api.iconify.design/simple-icons:openrouter.svg",
	},
	{ name: "OpenAI", logo: "https://openai.com/favicon.ico" },
	{ name: "DeepSeek", logo: "https://cdn.deepseek.com/platform/favicon.png" },
	{
		name: "Google AI",
		logo: "https://api.iconify.design/simple-icons:google.svg",
	},
	{ name: "DeepInfra", logo: "https://deepinfra.com/favicon.ico" },
	{ name: "ZenMux", logo: "https://zenmux.ai/favicon.ico" },
	{ name: "Qwen", logo: "https://qwenlm.github.io/favicon.png" },
	{ name: "Antigravity", logo: "https://antigravity.google/favicon.ico" },
];

const GITHUB_URL = "https://github.com/BingoWon/Keyaos";

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

function GitHubIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			className={className}
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
		</svg>
	);
}

function Navbar() {
	const { t } = useTranslation();
	const { isLoaded, isSignedIn } = useAuth();
	const authed = isLoaded && isSignedIn;

	return (
		<header className="fixed inset-x-0 top-0 z-50 backdrop-blur-lg bg-white/70 dark:bg-gray-950/70 border-b border-gray-200/50 dark:border-white/5">
			<nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
				<Link
					to="/"
					className="flex items-center gap-2.5 text-lg font-bold text-gray-900 dark:text-white"
				>
					<img src="/logo.png" alt="Keyaos" className="size-7" />
					{t("brand.name")}
				</Link>

				<div className="flex items-center gap-1.5">
					<ThemeToggle />
					<LanguageSelector />
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
						aria-label="GitHub"
					>
						<GitHubIcon className="size-5" />
					</a>
					<Link
						to="/docs"
						className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
						aria-label="Docs"
					>
						<BookOpenIcon className="size-5" />
					</Link>
					{authed ? (
						<>
							<Link
								to="/dashboard"
								className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm shadow-brand-500/20 transition-colors hover:bg-brand-600 dark:hover:bg-brand-400"
							>
								{t("nav.dashboard")}
							</Link>
							{isPlatform && <UserButton />}
						</>
					) : (
						<>
							<Link
								to="/login"
								className="hidden items-center px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900 sm:inline-flex dark:text-gray-400 dark:hover:text-white"
							>
								{t("landing.cta_signup")}
							</Link>
							<Link
								to="/login"
								className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm shadow-brand-500/20 transition-colors hover:bg-brand-600 dark:hover:bg-brand-400"
							>
								{t("landing.cta_signin")}
							</Link>
						</>
					)}
				</div>
			</nav>
		</header>
	);
}

function Hero() {
	const { t } = useTranslation();
	const { isLoaded, isSignedIn } = useAuth();
	const authed = isLoaded && isSignedIn;

	return (
		<section className="relative isolate overflow-hidden pt-14">
			{/* Grid pattern */}
			<div
				className="absolute inset-0 -z-10 opacity-[0.03] dark:opacity-[0.04]"
				style={{
					backgroundImage:
						"linear-gradient(var(--color-brand-500) 1px, transparent 1px), linear-gradient(90deg, var(--color-brand-500) 1px, transparent 1px)",
					backgroundSize: "64px 64px",
				}}
			/>

			{/* Gradient orbs */}
			<div className="pointer-events-none absolute -z-10 inset-0">
				<div className="animate-float-slow absolute -top-32 left-1/4 h-[500px] w-[500px] rounded-full bg-brand-400/15 blur-[128px] dark:bg-brand-500/10" />
				<div className="animate-float-slow-reverse absolute -bottom-32 right-1/4 h-[400px] w-[400px] rounded-full bg-accent-400/15 blur-[128px] dark:bg-accent-400/10" />
			</div>

			<div className="mx-auto max-w-4xl px-6 pb-24 pt-32 text-center sm:pt-40">
				{/* Tagline badge */}
				<div className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/80 px-4 py-1.5 text-sm font-medium text-brand-700 backdrop-blur dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
					<span className="relative flex size-2">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
						<span className="relative inline-flex size-2 rounded-full bg-brand-500" />
					</span>
					{t("landing.hero_tagline")}
				</div>

				{/* Title */}
				<h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
					<span className="bg-gradient-to-br from-gray-900 via-brand-700 to-brand-500 bg-clip-text text-transparent dark:from-white dark:via-brand-200 dark:to-brand-400">
						{t("landing.hero_title")}
					</span>
				</h1>

				{/* Subtitle */}
				<p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 dark:text-gray-400 sm:text-xl">
					{t("landing.hero_subtitle")}
				</p>

				{/* CTAs */}
				<div className="mt-10 flex flex-wrap items-center justify-center gap-4">
					<Link
						to={authed ? "/dashboard" : "/login"}
						className="group inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-600 hover:shadow-brand-500/35 dark:hover:bg-brand-400"
					>
						{authed ? t("landing.cta_dashboard") : t("landing.cta_start")}
						<ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
					</Link>
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white/80 px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm backdrop-blur transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
					>
						<GitHubIcon className="size-5" />
						{t("landing.cta_github")}
					</a>
				</div>
			</div>
		</section>
	);
}

function ProviderStrip() {
	const { t } = useTranslation();
	return (
		<section className="border-y border-gray-200 bg-gray-50/50 py-10 dark:border-white/5 dark:bg-white/[0.02]">
			<div className="mx-auto max-w-6xl px-6">
				<p className="mb-6 text-center text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
					{t("landing.providers_label")}
				</p>
				<div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-12">
					{PROVIDERS.map((p) => (
						<div
							key={p.name}
							className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400"
						>
							<img
								src={p.logo}
								alt={p.name}
								className="size-5 rounded-full object-cover"
								loading="lazy"
							/>
							{p.name}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function HowItWorks() {
	const { t } = useTranslation();
	const steps: { icon: HeroIcon; title: string; desc: string }[] = [
		{
			icon: KeyIcon,
			title: t("landing.step1_title"),
			desc: t("landing.step1_desc"),
		},
		{
			icon: BoltIcon,
			title: t("landing.step2_title"),
			desc: t("landing.step2_desc"),
		},
		{
			icon: CommandLineIcon,
			title: t("landing.step3_title"),
			desc: t("landing.step3_desc"),
		},
	];

	return (
		<section className="py-24 sm:py-32">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-2xl text-center">
					<h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
						{t("landing.how_title")}
					</h2>
					<p className="mt-3 text-base text-gray-500 dark:text-gray-400">
						{t("landing.how_subtitle")}
					</p>
				</div>

				<div className="mt-16 grid gap-8 sm:grid-cols-3">
					{steps.map((step, i) => (
						<div key={step.title} className="relative text-center">
							{/* Connector line (hidden on mobile, between cards on sm+) */}
							{i < steps.length - 1 && (
								<div className="absolute right-0 top-8 hidden h-px w-full translate-x-1/2 bg-gradient-to-r from-brand-300 to-transparent sm:block dark:from-brand-500/40" />
							)}

							<div className="relative mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-500/10">
								<step.icon className="size-7 text-brand-500" />
								<span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
									{i + 1}
								</span>
							</div>
							<h3 className="mt-5 text-base font-semibold text-gray-900 dark:text-white">
								{step.title}
							</h3>
							<p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
								{step.desc}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function Features() {
	const { t } = useTranslation();
	const features: { icon: HeroIcon; title: string; desc: string }[] = [
		{
			icon: BoltIcon,
			title: t("landing.feat_routing_title"),
			desc: t("landing.feat_routing_desc"),
		},
		{
			icon: CodeBracketIcon,
			title: t("landing.feat_protocol_title"),
			desc: t("landing.feat_protocol_desc"),
		},
		{
			icon: UserGroupIcon,
			title: t("landing.feat_marketplace_title"),
			desc: t("landing.feat_marketplace_desc"),
		},
		{
			icon: SignalIcon,
			title: t("landing.feat_streaming_title"),
			desc: t("landing.feat_streaming_desc"),
		},
		{
			icon: HeartIcon,
			title: t("landing.feat_opensource_title"),
			desc: t("landing.feat_opensource_desc"),
		},
		{
			icon: GlobeAltIcon,
			title: t("landing.feat_edge_title"),
			desc: t("landing.feat_edge_desc"),
		},
	];

	return (
		<section className="border-t border-gray-200 bg-gray-50/50 py-24 sm:py-32 dark:border-white/5 dark:bg-white/[0.02]">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-2xl text-center">
					<h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
						{t("landing.features_title")}
					</h2>
					<p className="mt-3 text-base text-gray-500 dark:text-gray-400">
						{t("landing.features_subtitle")}
					</p>
				</div>

				<div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{features.map((f) => (
						<div
							key={f.title}
							className="group rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg hover:shadow-brand-500/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:shadow-brand-500/5"
						>
							<div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 transition-colors group-hover:bg-brand-100 dark:bg-brand-500/10 dark:group-hover:bg-brand-500/15">
								<f.icon className="size-5.5 text-brand-500" />
							</div>
							<h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">
								{f.title}
							</h3>
							<p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
								{f.desc}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function CodeExample() {
	const { t } = useTranslation();
	return (
		<section className="py-24 sm:py-32">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-2xl text-center">
					<h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
						{t("landing.code_title")}
					</h2>
					<p className="mt-3 text-base text-gray-500 dark:text-gray-400">
						{t("landing.code_subtitle")}
					</p>
				</div>

				<div className="mx-auto mt-12 max-w-2xl">
					<div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
						{/* Terminal chrome */}
						<div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
							<span className="size-3 rounded-full bg-red-500/80" />
							<span className="size-3 rounded-full bg-yellow-500/80" />
							<span className="size-3 rounded-full bg-green-500/80" />
							<span className="ml-3 text-xs text-gray-500">app.py</span>
						</div>
						{/* Code */}
						<pre className="overflow-x-auto p-5 text-[13px] leading-relaxed">
							<code>
								<span className="text-blue-400">from</span>
								<span className="text-gray-300"> openai </span>
								<span className="text-blue-400">import</span>
								<span className="text-green-400"> OpenAI</span>
								{"\n\n"}
								<span className="text-gray-300">client = </span>
								<span className="text-green-400">OpenAI</span>
								<span className="text-gray-500">(</span>
								{"\n"}
								<span className="text-gray-300">{"    "}</span>
								<span className="text-orange-300">base_url</span>
								<span className="text-gray-500">=</span>
								<span className="text-amber-300">
									"https://your-gateway.workers.dev/v1"
								</span>
								<span className="text-gray-500">,</span>
								<span className="ml-2 text-gray-600">{"# ← just this"}</span>
								{"\n"}
								<span className="text-gray-300">{"    "}</span>
								<span className="text-orange-300">api_key</span>
								<span className="text-gray-500">=</span>
								<span className="text-amber-300">"key-..."</span>
								<span className="text-gray-500">,</span>
								{"\n"}
								<span className="text-gray-500">)</span>
								{"\n\n"}
								<span className="text-gray-300">response = client.</span>
								<span className="text-blue-300">chat.completions.create</span>
								<span className="text-gray-500">(</span>
								{"\n"}
								<span className="text-gray-300">{"    "}</span>
								<span className="text-orange-300">model</span>
								<span className="text-gray-500">=</span>
								<span className="text-amber-300">
									"google/gemini-2.5-flash"
								</span>
								<span className="text-gray-500">,</span>
								{"\n"}
								<span className="text-gray-300">{"    "}</span>
								<span className="text-orange-300">messages</span>
								<span className="text-gray-500">=</span>
								<span className="text-gray-500">[{"{"}</span>
								<span className="text-amber-300">"role"</span>
								<span className="text-gray-500">: </span>
								<span className="text-amber-300">"user"</span>
								<span className="text-gray-500">, </span>
								<span className="text-amber-300">"content"</span>
								<span className="text-gray-500">: </span>
								<span className="text-amber-300">"Hello!"</span>
								<span className="text-gray-500">{"}],"}</span>
								{"\n"}
								<span className="text-gray-500">)</span>
							</code>
						</pre>
					</div>
				</div>
			</div>
		</section>
	);
}

function FinalCTA() {
	const { t } = useTranslation();
	const { isLoaded, isSignedIn } = useAuth();
	const authed = isLoaded && isSignedIn;

	return (
		<section className="py-24 sm:py-32">
			<div className="mx-auto max-w-6xl px-6">
				<div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-500 to-accent-400 px-8 py-20 text-center shadow-2xl shadow-brand-500/20 sm:px-16">
					{/* Subtle grid overlay */}
					<div
						className="absolute inset-0 -z-10 opacity-[0.07]"
						style={{
							backgroundImage:
								"linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
							backgroundSize: "48px 48px",
						}}
					/>

					<h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
						{t("landing.cta_final_title")}
					</h2>
					<p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-white/70">
						{t("landing.cta_final_subtitle")}
					</p>
					<div className="mt-10 flex flex-wrap items-center justify-center gap-4">
						<Link
							to={authed ? "/dashboard" : "/login"}
							className="group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-600 shadow-lg transition-colors hover:bg-white/90"
						>
							{authed ? t("landing.cta_dashboard") : t("landing.cta_start")}
							<ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
						</Link>
						<a
							href={GITHUB_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
						>
							{t("landing.cta_github")}
						</a>
					</div>
				</div>
			</div>
		</section>
	);
}

function Footer() {
	const { t } = useTranslation();
	return (
		<footer className="border-t border-gray-200 py-12 dark:border-white/5">
			<div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
				<div className="flex items-center gap-2.5">
					<img src="/logo.png" alt="Keyaos" className="size-6" />
					<div>
						<span className="text-base font-bold text-gray-900 dark:text-white">
							{t("brand.name")}
						</span>
						<span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
							{t("landing.footer_desc")}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
					<Link to="/docs" className="transition-colors hover:text-brand-500">
						{t("landing.footer_docs")}
					</Link>
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-brand-500"
					>
						{t("landing.footer_github")}
					</a>
				</div>
				<p className="text-xs text-gray-400 dark:text-gray-600">
					&copy; {new Date().getFullYear()} Keyaos
				</p>
			</div>
		</footer>
	);
}

const JSON_LD = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "Keyaos",
	url: "https://keyaos.com",
	applicationCategory: "DeveloperApplication",
	operatingSystem: "Web",
	description:
		"Source-available AI API gateway that routes every request to the cheapest healthy provider.",
	offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
	license: `${GITHUB_URL}/blob/main/LICENSE`,
};

export function Landing() {
	return (
		<div className="min-h-screen bg-white dark:bg-gray-950">
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD
				dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
			/>
			<Navbar />
			<Hero />
			<ProviderStrip />
			<HowItWorks />
			<Features />
			<CodeExample />
			<FinalCTA />
			<Footer />
		</div>
	);
}

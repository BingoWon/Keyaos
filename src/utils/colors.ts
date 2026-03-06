/**
 * Global semantic color token system.
 *
 * Every colored UI element (badges, filters, tags, icons, error states, etc.)
 * should consume tokens from here — never ad-hoc Tailwind color classes.
 *
 * Each token maps to a Tailwind color scale and provides pre-composed class
 * bundles for common patterns. All classes are written as full static strings
 * so Tailwind's static analysis can discover them.
 */

export interface ColorToken {
	/** Solid fill — active chips, count badges */
	solid: string;
	/** Soft fill — badge bg, tags, inactive chips, list highlight */
	soft: string;
	/** Soft hover — interactive soft elements */
	softHover: string;
	/** Border-based — health badges, info/warning boxes */
	outline: string;
	/** Text-only — inline amounts, status text, icons */
	text: string;
	/** Text hover — interactive text elements */
	textHover: string;
	/** Ring — popover/focus ring */
	ring: string;
	/** Border accent — popover open border */
	border: string;
	/** Control — checkbox/toggle solid fill */
	control: string;
}

export type TokenName = keyof typeof TOKENS;

export const TOKENS = {
	sky: {
		solid: "bg-sky-500 text-white",
		soft: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
		softHover: "hover:bg-sky-100 dark:hover:bg-sky-500/15",
		outline:
			"border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
		text: "text-sky-600 dark:text-sky-400",
		textHover: "hover:text-sky-900 dark:hover:text-sky-300",
		ring: "ring-sky-400/30 dark:ring-sky-500/20",
		border: "border-sky-400 dark:border-sky-500",
		control: "border-sky-500 bg-sky-500 dark:border-sky-400 dark:bg-sky-500",
	},
	violet: {
		solid: "bg-violet-500 text-white",
		soft: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
		softHover: "hover:bg-violet-100 dark:hover:bg-violet-500/15",
		outline:
			"border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
		text: "text-violet-600 dark:text-violet-400",
		textHover: "hover:text-violet-900 dark:hover:text-violet-300",
		ring: "ring-violet-400/30 dark:ring-violet-500/20",
		border: "border-violet-400 dark:border-violet-500",
		control:
			"border-violet-500 bg-violet-500 dark:border-violet-400 dark:bg-violet-500",
	},
	teal: {
		solid: "bg-teal-500 text-white",
		soft: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300",
		softHover: "hover:bg-teal-100 dark:hover:bg-teal-500/15",
		outline:
			"border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300",
		text: "text-teal-600 dark:text-teal-400",
		textHover: "hover:text-teal-900 dark:hover:text-teal-300",
		ring: "ring-teal-400/30 dark:ring-teal-500/20",
		border: "border-teal-400 dark:border-teal-500",
		control:
			"border-teal-500 bg-teal-500 dark:border-teal-400 dark:bg-teal-500",
	},
	amber: {
		solid: "bg-amber-500 text-white",
		soft: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
		softHover: "hover:bg-amber-100 dark:hover:bg-amber-500/15",
		outline:
			"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
		text: "text-amber-600 dark:text-amber-400",
		textHover: "hover:text-amber-900 dark:hover:text-amber-300",
		ring: "ring-amber-400/30 dark:ring-amber-500/20",
		border: "border-amber-400 dark:border-amber-500",
		control:
			"border-amber-500 bg-amber-500 dark:border-amber-400 dark:bg-amber-500",
	},
	rose: {
		solid: "bg-rose-500 text-white",
		soft: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
		softHover: "hover:bg-rose-100 dark:hover:bg-rose-500/15",
		outline:
			"border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
		text: "text-rose-600 dark:text-rose-400",
		textHover: "hover:text-rose-900 dark:hover:text-rose-300",
		ring: "ring-rose-400/30 dark:ring-rose-500/20",
		border: "border-rose-400 dark:border-rose-500",
		control:
			"border-rose-500 bg-rose-500 dark:border-rose-400 dark:bg-rose-500",
	},
	red: {
		solid: "bg-red-500 text-white",
		soft: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
		softHover: "hover:bg-red-100 dark:hover:bg-red-500/15",
		outline:
			"border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
		text: "text-red-600 dark:text-red-400",
		textHover: "hover:text-red-900 dark:hover:text-red-300",
		ring: "ring-red-400/30 dark:ring-red-500/20",
		border: "border-red-400 dark:border-red-500",
		control: "border-red-500 bg-red-500 dark:border-red-400 dark:bg-red-500",
	},
	green: {
		solid: "bg-green-500 text-white",
		soft: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300",
		softHover: "hover:bg-green-100 dark:hover:bg-green-500/15",
		outline:
			"border-green-200 bg-green-50 text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
		text: "text-green-600 dark:text-green-400",
		textHover: "hover:text-green-900 dark:hover:text-green-300",
		ring: "ring-green-400/30 dark:ring-green-500/20",
		border: "border-green-400 dark:border-green-500",
		control:
			"border-green-500 bg-green-500 dark:border-green-400 dark:bg-green-500",
	},
	yellow: {
		solid: "bg-yellow-500 text-white",
		soft: "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300",
		softHover: "hover:bg-yellow-100 dark:hover:bg-yellow-500/15",
		outline:
			"border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-300",
		text: "text-yellow-600 dark:text-yellow-400",
		textHover: "hover:text-yellow-900 dark:hover:text-yellow-300",
		ring: "ring-yellow-400/30 dark:ring-yellow-500/20",
		border: "border-yellow-400 dark:border-yellow-500",
		control:
			"border-yellow-500 bg-yellow-500 dark:border-yellow-400 dark:bg-yellow-500",
	},
	blue: {
		solid: "bg-blue-500 text-white",
		soft: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
		softHover: "hover:bg-blue-100 dark:hover:bg-blue-500/15",
		outline:
			"border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
		text: "text-blue-600 dark:text-blue-400",
		textHover: "hover:text-blue-900 dark:hover:text-blue-300",
		ring: "ring-blue-400/30 dark:ring-blue-500/20",
		border: "border-blue-400 dark:border-blue-500",
		control:
			"border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-500",
	},
} as const satisfies Record<string, ColorToken>;

export const TOKEN_NAMES = Object.keys(TOKENS) as TokenName[];

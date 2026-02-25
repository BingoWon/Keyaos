import { Crisp } from "crisp-sdk-web";
import i18n from "../locales/i18n";

const GA_ID = "G-0HXS0JNMTT";
const CONSENT_KEY = "cookie_consent";

export type ConsentStatus = "accepted" | "declined" | null;

export function getConsent(): ConsentStatus {
	return localStorage.getItem(CONSENT_KEY) as ConsentStatus;
}

export function setConsent(status: "accepted" | "declined") {
	localStorage.setItem(CONSENT_KEY, status);
}

let gaLoaded = false;

export function loadGA() {
	if (gaLoaded) return;
	gaLoaded = true;

	const script = document.createElement("script");
	script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
	script.async = true;
	document.head.appendChild(script);

	const w = window as typeof window & {
		dataLayer: unknown[];
		gtag: (...args: unknown[]) => void;
	};
	w.dataLayer = w.dataLayer || [];
	w.gtag = (...args: unknown[]) => {
		w.dataLayer.push(args);
	};
	w.gtag("js", new Date());
	w.gtag("config", GA_ID);
}

let crispLoaded = false;

type CrispWindow = Window & {
	CRISP_RUNTIME_CONFIG?: { locale: string };
	$crisp?: unknown[][];
};

function setCrispLocale(lng: string) {
	try {
		(window as CrispWindow).$crisp?.push([
			"set",
			"session:locale",
			[lng],
		]);
	} catch {
		/* best-effort */
	}
}

export function loadCrisp() {
	const crispId = import.meta.env.VITE_CRISP_WEBSITE_ID;
	if (!crispId || crispLoaded) return;
	crispLoaded = true;

	(window as CrispWindow).CRISP_RUNTIME_CONFIG = {
		locale: i18n.language,
	};

	Crisp.configure(crispId);

	setCrispLocale(i18n.language);

	i18n.on("languageChanged", setCrispLocale);
}

export function loadAllAnalytics() {
	loadGA();
	loadCrisp();
}

export function initAnalyticsFromConsent() {
	if (getConsent() === "accepted") {
		loadAllAnalytics();
	}
}

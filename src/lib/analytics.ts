import { Crisp } from "crisp-sdk-web";
import i18n from "../locales/i18n";

const CONSENT_KEY = "cookie_consent";

export function getConsent(): "accepted" | "declined" | null {
	return localStorage.getItem(CONSENT_KEY) as ReturnType<typeof getConsent>;
}

export function setConsent(status: "accepted" | "declined") {
	localStorage.setItem(CONSENT_KEY, status);
}

let gaLoaded = false;

export function loadGA() {
	const gaId = import.meta.env.VITE_GA_ID;
	if (!gaId || gaLoaded) return;
	gaLoaded = true;

	const script = document.createElement("script");
	script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
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
	w.gtag("config", gaId);
}

let crispLoaded = false;

export function loadCrisp() {
	const crispId = import.meta.env.VITE_CRISP_WEBSITE_ID;
	if (!crispId || crispLoaded) return;
	crispLoaded = true;

	const w = window as Window & {
		CRISP_RUNTIME_CONFIG?: { locale: string };
	};
	w.CRISP_RUNTIME_CONFIG = { locale: i18n.language };

	Crisp.configure(crispId);
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

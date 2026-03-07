/**
 * Locale store — manages wolfcha's game locale independently.
 * Reads/writes to localStorage only; no URL path rewriting (Keyaos handles routing).
 */

import { type AppLocale, defaultLocale, STORAGE_KEY } from "./config";

let currentLocale: AppLocale = defaultLocale;
const listeners = new Set<(locale: AppLocale) => void>();

const readLocaleFromStorage = (): AppLocale | null => {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === "zh" || raw === "en") return raw;
	} catch {}
	return null;
};

export const getLocale = (): AppLocale => currentLocale;

export const setLocale = (locale: AppLocale): void => {
	if (locale === currentLocale) return;
	currentLocale = locale;
	listeners.forEach((fn) => fn(locale));
	try {
		localStorage.setItem(STORAGE_KEY, locale);
	} catch {}
};

export const subscribeLocale = (
	listener: (locale: AppLocale) => void,
): (() => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

export const loadLocaleFromStorage = (): AppLocale => {
	const stored = readLocaleFromStorage();
	if (stored) currentLocale = stored;
	return currentLocale;
};

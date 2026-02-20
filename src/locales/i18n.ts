import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import zh from "./zh.json";

const resources = {
	en: { translation: en },
	zh: { translation: zh },
};

// Get saved language or detect browser language
const savedLang = localStorage.getItem("keyaos-lang");
const browserLang = navigator.language.split("-")[0];
const defaultLang = savedLang || (browserLang === "zh" ? "zh" : "en");

i18n.use(initReactI18next).init({
	resources,
	lng: defaultLang,
	fallbackLng: "en",
	interpolation: {
		escapeValue: false, // React already escapes by default
	},
});

// Save language changes to localStorage
i18n.on("languageChanged", (lng) => {
	localStorage.setItem("keyaos-lang", lng);
});

export default i18n;

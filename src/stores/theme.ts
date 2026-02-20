import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
	theme: Theme;
	setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
	persist(
		(set) => ({
			theme: "system",
			setTheme: (theme) => {
				set({ theme });
				applyTheme(theme);
			},
		}),
		{
			name: "theme-storage",
			onRehydrateStorage: () => (state) => {
				if (state) {
					applyTheme(state.theme);
				}
			},
		},
	),
);

export function applyTheme(theme: Theme) {
	const root = window.document.documentElement;
	const isDark =
		theme === "dark" ||
		(theme === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);

	if (isDark) {
		root.classList.add("dark");
	} else {
		root.classList.remove("dark");
	}
}

// Listen for system theme changes
if (typeof window !== "undefined") {
	window
		.matchMedia("(prefers-color-scheme: dark)")
		.addEventListener("change", () => {
			const currentTheme = useThemeStore.getState().theme;
			if (currentTheme === "system") {
				applyTheme("system");
			}
		});
}

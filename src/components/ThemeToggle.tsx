import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
	ComputerDesktopIcon,
	MoonIcon,
	SunIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { type Theme, useThemeStore } from "../stores/theme";
import { classNames } from "../utils/classNames";

export function ThemeToggle() {
	const { theme, setTheme } = useThemeStore();
	const { t } = useTranslation();

	const icons = {
		light: SunIcon,
		dark: MoonIcon,
		system: ComputerDesktopIcon,
	};

	const CurrentIcon = icons[theme] || ComputerDesktopIcon;

	return (
		<Menu>
			<MenuButton className="flex items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
				<span className="sr-only">Toggle theme</span>
				<CurrentIcon className="size-5" aria-hidden="true" />
			</MenuButton>
			<MenuItems
				anchor="bottom end"
				transition
				className="z-[100] w-36 [--anchor-gap:6px] rounded-xl border border-gray-200 bg-white p-1 shadow-lg focus:outline-none dark:border-white/10 dark:bg-gray-900 transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
			>
				{(["light", "dark", "system"] as Theme[]).map((tValue) => {
					const Icon = icons[tValue];
					return (
						<MenuItem key={tValue}>
							{({ focus }) => (
								<button
									type="button"
									onClick={() => setTheme(tValue)}
									className={classNames(
										focus ? "bg-gray-100 dark:bg-white/10" : "",
										theme === tValue
											? "text-brand-600 dark:text-brand-400"
											: "text-gray-700 dark:text-gray-300",
										"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
									)}
								>
									<Icon className="size-5 text-gray-400" />
									{t(`theme.${tValue}`)}
								</button>
							)}
						</MenuItem>
					);
				})}
			</MenuItems>
		</Menu>
	);
}

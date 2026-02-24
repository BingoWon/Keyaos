import {
	Menu,
	MenuButton,
	MenuItem,
	MenuItems,
} from "@headlessui/react";
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
			<MenuButton className="flex items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
				<span className="sr-only">Toggle theme</span>
				<CurrentIcon className="h-5 w-5" aria-hidden="true" />
			</MenuButton>
			<MenuItems
				anchor="bottom end"
				transition
				className="z-10 w-36 [--anchor-gap:4px] rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none dark:bg-gray-800 dark:ring-white/10 origin-[--popover-origin] transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
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
										focus
											? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white"
											: "text-gray-700 dark:text-gray-300",
										theme === tValue && "text-indigo-600 dark:text-indigo-400",
										"group flex w-full items-center px-4 py-2 text-sm",
									)}
								>
									<Icon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500 dark:text-gray-400 dark:group-hover:text-gray-300" />
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

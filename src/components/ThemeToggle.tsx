import { Menu, Transition } from "@headlessui/react";
import {
	ComputerDesktopIcon,
	MoonIcon,
	SunIcon,
} from "@heroicons/react/24/outline";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { type Theme, useThemeStore } from "../stores/theme";

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
		<Menu as="div" className="relative inline-block text-left">
			<div>
				<Menu.Button className="flex items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
					<span className="sr-only">Toggle theme</span>
					<CurrentIcon className="h-5 w-5" aria-hidden="true" />
				</Menu.Button>
			</div>

			<Transition
				as={Fragment}
				enter="transition ease-out duration-100"
				enterFrom="transform opacity-0 scale-95"
				enterTo="transform opacity-100 scale-100"
				leave="transition ease-in duration-75"
				leaveFrom="transform opacity-100 scale-100"
				leaveTo="transform opacity-0 scale-95"
			>
				<Menu.Items className="absolute right-0 bottom-full z-10 w-36 origin-bottom-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800 dark:ring-white/10 mb-2">
					<div className="py-1">
						{(["light", "dark", "system"] as Theme[]).map((tValue) => {
							const Icon = icons[tValue];
							return (
								<Menu.Item key={tValue}>
									{({ active }) => (
										<button
											type="button"
											onClick={() => setTheme(tValue)}
											className={`
                        ${active ? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white" : "text-gray-700 dark:text-gray-300"}
                        ${theme === tValue ? "text-indigo-600 dark:text-indigo-400" : ""}
                        group flex w-full items-center px-4 py-2 text-sm
                      `}
										>
											<Icon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500 dark:text-gray-400 dark:group-hover:text-gray-300" />
											{t(`theme.${tValue}`)}
										</button>
									)}
								</Menu.Item>
							);
						})}
					</div>
				</Menu.Items>
			</Transition>
		</Menu>
	);
}

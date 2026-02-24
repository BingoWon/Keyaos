import {
	Menu,
	MenuButton,
	MenuItem,
	MenuItems,
} from "@headlessui/react";
import { LanguageIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { classNames } from "../utils/classNames";

export function LanguageSelector() {
	const { i18n } = useTranslation();

	const languages = [
		{ code: "en", name: "English" },
		{ code: "zh", name: "简体中文" },
	];

	return (
		<Menu>
			<MenuButton className="flex items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
				<span className="sr-only">Change language</span>
				<LanguageIcon className="h-5 w-5" aria-hidden="true" />
			</MenuButton>
			<MenuItems
				anchor="bottom end"
				transition
				className="z-[100] w-36 [--anchor-gap:4px] rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none dark:bg-gray-800 dark:ring-white/10 transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
			>
				{languages.map((lang) => (
					<MenuItem key={lang.code}>
						{({ focus }) => (
							<button
								type="button"
								onClick={() => i18n.changeLanguage(lang.code)}
								className={classNames(
									focus
										? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white"
										: "text-gray-700 dark:text-gray-300",
									i18n.language === lang.code &&
										"text-indigo-600 dark:text-indigo-400 font-semibold",
									"group flex w-full items-center px-4 py-2 text-sm",
								)}
							>
								{lang.name}
							</button>
						)}
					</MenuItem>
				))}
			</MenuItems>
		</Menu>
	);
}

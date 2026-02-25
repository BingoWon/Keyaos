import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
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
			<MenuButton className="flex items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
				<span className="sr-only">Change language</span>
				<LanguageIcon className="size-5" aria-hidden="true" />
			</MenuButton>
			<MenuItems
				anchor="bottom end"
				transition
				className="z-[100] w-36 [--anchor-gap:6px] rounded-xl border border-gray-200 bg-white p-1 shadow-lg focus:outline-none dark:border-white/10 dark:bg-gray-900 transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
			>
				{languages.map((lang) => (
					<MenuItem key={lang.code}>
						{({ focus }) => (
							<button
								type="button"
								onClick={() => i18n.changeLanguage(lang.code)}
								className={classNames(
									focus ? "bg-gray-100 dark:bg-white/10" : "",
									i18n.language === lang.code
										? "text-brand-600 dark:text-brand-400 font-semibold"
										: "text-gray-700 dark:text-gray-300",
									"flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors",
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

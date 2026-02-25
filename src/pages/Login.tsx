import { useTranslation } from "react-i18next";
import { LoginContent } from "../auth";
import { LanguageSelector } from "../components/LanguageSelector";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";

export function Login() {
	const { t } = useTranslation();
	const subtitle = t("brand.subtitle");

	return (
		<div className="flex min-h-screen flex-1 flex-col items-center justify-center px-6 py-12 lg:px-8 bg-gray-50 dark:bg-gray-900 transition-colors">
			<div className="absolute top-4 right-4 flex items-center gap-2">
				<ThemeToggle />
				<LanguageSelector />
			</div>

			<div className="sm:mx-auto sm:w-full sm:max-w-sm flex flex-col items-center mb-8">
				<Logo size="lg" />
				{subtitle && (
					<p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 tracking-widest">
						{subtitle}
					</p>
				)}
			</div>

			<div className="sm:mx-auto sm:w-full sm:max-w-sm flex justify-center">
				<LoginContent />
			</div>
		</div>
	);
}

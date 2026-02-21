import { SignIn } from "@clerk/clerk-react";
import { LanguageSelector } from "../components/LanguageSelector";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";

export function Login() {
	return (
		<div className="flex min-h-screen flex-1 flex-col items-center justify-center px-6 py-12 lg:px-8 bg-gray-50 dark:bg-gray-900 transition-colors">
			<div className="absolute top-4 right-4 flex items-center gap-4">
				<ThemeToggle />
				<LanguageSelector />
			</div>

			<div className="sm:mx-auto sm:w-full sm:max-w-sm flex flex-col items-center mb-8">
				<Logo size="lg" />
			</div>

			<div className="sm:mx-auto sm:w-full sm:max-w-sm flex justify-center">
				<SignIn routing="path" path="/login" />
			</div>
		</div>
	);
}

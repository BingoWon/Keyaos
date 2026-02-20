import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LanguageSelector } from "../components/LanguageSelector";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";

import { useAuth } from "../stores/auth";

export function Login() {
	const [password, setPassword] = useState("");
	const [error, setError] = useState(false);
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { login } = useAuth();

	const handleLogin = (e: React.FormEvent) => {
		e.preventDefault();
		const success = login(password);
		if (success) {
			navigate("/");
		} else {
			setError(true);
		}
	};

	return (
		<div className="flex min-h-screen flex-1 flex-col justify-center px-6 py-12 lg:px-8 bg-gray-50 dark:bg-gray-900 transition-colors">
			<div className="absolute top-4 right-4 flex items-center gap-4">
				<ThemeToggle />
				<LanguageSelector />
			</div>

			<div className="sm:mx-auto sm:w-full sm:max-w-sm flex flex-col items-center">
				<Logo size="lg" />
				<h2 className="mt-6 text-center text-2xl/9 font-bold tracking-tight text-gray-900 dark:text-white">
					{t("login.title")}
				</h2>
			</div>

			<div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
				<form onSubmit={handleLogin} className="space-y-6">
					<div>
						<label
							htmlFor="password"
							className="block text-sm/6 font-medium text-gray-900 dark:text-gray-200"
						>
							{t("login.password")}
						</label>
						<div className="mt-2">
							<input
								id="password"
								name="password"
								type="password"
								required
								value={password}
								onChange={(e) => {
									setPassword(e.target.value);
									setError(false);
								}}
								className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:focus:outline-indigo-500"
							/>
							{error && (
								<p className="mt-2 text-sm text-red-600 dark:text-red-400">
									{t("login.error")}
								</p>
							)}
						</div>
					</div>

					<div>
						<button
							type="submit"
							className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
						>
							{t("login.submit")}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

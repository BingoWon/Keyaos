/**
 * Entry point for the Werewolf game within Keyaos.
 * Injects auth token, fetches models, and renders the wolfcha page.
 */

import { loadLocaleFromStorage } from "@wolf/i18n/locale-store";
import { setSessionTokenGetter } from "@wolf/lib/game-session-tracker";
import {
	fetchKeyaosModels,
	setModelTokenGetter,
} from "@wolf/lib/keyaos-models";
import { setAuthTokenGetter } from "@wolf/lib/llm";
import { setModelPool } from "@wolf/types/game";
import { Crisp } from "crisp-sdk-web";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useAuth } from "@/auth";
import { hasCrisp } from "@/lib/analytics";
import "@wolf/app/globals.css";
import WerewolfPage from "@wolf/app/page";

loadLocaleFromStorage();

export default function WerewolfEntry() {
	const { getToken } = useAuth();
	const [ready, setReady] = useState(false);

	useEffect(() => {
		if (hasCrisp) Crisp.chat.hide();
		return () => {
			if (hasCrisp) Crisp.chat.show();
		};
	}, []);

	useEffect(() => {
		setAuthTokenGetter(getToken);
		setModelTokenGetter(getToken);
		setSessionTokenGetter(getToken);

		fetchKeyaosModels()
			.then((models) => {
				setModelPool(models);
				setReady(true);
			})
			.catch(() => setReady(true));
	}, [getToken]);

	if (!ready) {
		return (
			<div className="flex h-screen items-center justify-center bg-gray-950">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
			</div>
		);
	}

	return (
		<>
			<Toaster position="top-center" richColors />
			<WerewolfPage />
		</>
	);
}

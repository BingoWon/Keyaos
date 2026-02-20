import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
	isAuthenticated: boolean;
	token: string | null;
	login: (token: string) => boolean;
	logout: () => void;
}

export const useAuth = create<AuthState>()(
	persist(
		(set) => ({
			isAuthenticated: false,
			token: null,
			login: (token: string) => {
				const trimmedToken = token.trim();
				// Currently validates any non-empty string, matching MVP zero-config flow.
				// In a full implementation, this should ping a backend `/verify-token` endpoint.
				if (trimmedToken.length > 0) {
					set({ isAuthenticated: true, token: trimmedToken });
					return true;
				}
				return false;
			},
			logout: () => {
				set({ isAuthenticated: false, token: null });
			},
		}),
		{
			name: "keyaos-auth",
		},
	),
);

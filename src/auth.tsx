import {
	ClerkProvider,
	SignIn,
	UserButton,
	useAuth as useClerkAuth,
} from "@clerk/clerk-react";
import { dark } from "@clerk/themes";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

/** True when Clerk is configured → Platform (multi-tenant) mode */
export const isPlatform = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// ─── Unified Auth Context ───────────────────────────────

interface AuthContextType {
	getToken: () => Promise<string | null>;
	isLoaded: boolean;
	isSignedIn: boolean;
	/** null = not yet determined (loading), false = not admin, true = admin */
	isAdmin: boolean | null;
	signOut: () => void;
	/** Core mode only: sign in with admin token */
	signIn?: (token: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
	return ctx;
}

// ─── Core Auth (ADMIN_TOKEN, single tenant) ─────────────

function CoreAuthProvider({ children }: { children: ReactNode }) {
	const [token, setToken] = useState<string | null>(() =>
		localStorage.getItem("admin_token"),
	);

	const value = useMemo<AuthContextType>(
		() => ({
			getToken: async () => token,
			isLoaded: true,
			isSignedIn: !!token,
			isAdmin: false as const,
			signOut: () => {
				localStorage.removeItem("admin_token");
				setToken(null);
			},
			signIn: (t: string) => {
				localStorage.setItem("admin_token", t);
				setToken(t);
			},
		}),
		[token],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Platform Auth Bridge (Clerk → AuthContext) ─────────

function ClerkAuthBridge({ children }: { children: ReactNode }) {
	const clerk = useClerkAuth();
	const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

	useEffect(() => {
		if (!clerk.isSignedIn) {
			setIsAdmin(false);
			return;
		}
		clerk.getToken().then((t) => {
			if (!t) {
				setIsAdmin(false);
				return;
			}
			fetch("/api/me", { headers: { Authorization: `Bearer ${t}` } })
				.then((r) => r.json())
				.then((d: { isAdmin?: boolean }) => setIsAdmin(!!d.isAdmin))
				.catch(() => setIsAdmin(false));
		});
	}, [clerk.isSignedIn, clerk.getToken]);

	const value = useMemo<AuthContextType>(
		() => ({
			getToken: () => clerk.getToken(),
			isLoaded: clerk.isLoaded,
			isSignedIn: clerk.isSignedIn ?? false,
			isAdmin,
			signOut: () => {
				clerk.signOut();
			},
		}),
		[clerk.getToken, clerk.isLoaded, clerk.isSignedIn, clerk.signOut, isAdmin],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Dark Mode Detection ────────────────────────────────

function useDarkMode() {
	const [isDark, setIsDark] = useState(() =>
		document.documentElement.classList.contains("dark"),
	);

	useEffect(() => {
		const observer = new MutationObserver(() => {
			setIsDark(document.documentElement.classList.contains("dark"));
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);

	return isDark;
}

// ─── AuthProvider (auto-selects by env) ─────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
	const isDark = useDarkMode();

	if (isPlatform) {
		return (
			<ClerkProvider
				publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
				afterSignOutUrl="/login"
				signInForceRedirectUrl="/dashboard"
				appearance={{
					baseTheme: isDark ? dark : undefined,
					layout: { socialButtonsVariant: "blockButton" },
					elements: {
						socialButtons: {
							display: "flex",
							flexDirection: "column",
							gap: "12px",
						},
						socialButtonsBlockButton: {
							width: "100%",
						},
					},
				}}
			>
				<ClerkAuthBridge>{children}</ClerkAuthBridge>
			</ClerkProvider>
		);
	}
	return <CoreAuthProvider>{children}</CoreAuthProvider>;
}

// ─── AuthGuard ──────────────────────────────────────────

export function AuthGuard({
	children,
	fallback,
}: {
	children: ReactNode;
	fallback: ReactNode;
}) {
	const { isLoaded, isSignedIn } = useAuth();
	if (!isLoaded) return null;
	return <>{isSignedIn ? children : fallback}</>;
}

// ─── LoginPage ──────────────────────────────────────────

function CoreLoginForm() {
	const { signIn } = useAuth();
	const [token, setToken] = useState("");

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (token.trim()) signIn?.(token.trim());
			}}
			className="sm:mx-auto sm:w-full sm:max-w-sm flex flex-col gap-4"
		>
			<input
				type="password"
				placeholder="Admin Token"
				value={token}
				onChange={(e) => setToken(e.target.value)}
				className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
			/>
			<button
				type="submit"
				className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
			>
				Sign In
			</button>
		</form>
	);
}

export function LoginContent() {
	if (isPlatform)
		return (
			<SignIn routing="path" path="/login" forceRedirectUrl="/dashboard" />
		);
	return <CoreLoginForm />;
}

// ─── UserMenu (sidebar) ────────────────────────────────

function CoreUserMenu() {
	const { signOut } = useAuth();
	return (
		<button
			type="button"
			onClick={signOut}
			className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
		>
			Sign Out
		</button>
	);
}

export function UserMenu() {
	return isPlatform ? <UserButton /> : <CoreUserMenu />;
}

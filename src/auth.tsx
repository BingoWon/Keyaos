import {
    createContext,
    useContext,
    useState,
    useMemo,
    type ReactNode,
} from "react";
import {
    ClerkProvider,
    SignIn,
    UserButton,
    useAuth as useClerkAuth,
} from "@clerk/clerk-react";

/** True when Clerk is configured → Platform (multi-tenant) mode */
export const isPlatform = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// ─── Unified Auth Context ───────────────────────────────

interface AuthContextType {
    getToken: () => Promise<string | null>;
    isSignedIn: boolean;
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
            isSignedIn: !!token,
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

    const value = useMemo<AuthContextType>(
        () => ({
            getToken: () => clerk.getToken(),
            isSignedIn: clerk.isSignedIn ?? false,
            signOut: () => {
                clerk.signOut();
            },
        }),
        [clerk.getToken, clerk.isSignedIn, clerk.signOut],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── AuthProvider (auto-selects by env) ─────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    if (isPlatform) {
        return (
            <ClerkProvider
                publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
                afterSignOutUrl="/login"
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
    const { isSignedIn } = useAuth();
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
                autoFocus
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
    if (isPlatform) return <SignIn routing="path" path="/login" />;
    return <CoreLoginForm />;
}

// ─── UserMenu (sidebar) ────────────────────────────────

function CoreUserMenu() {
    const { signOut } = useAuth();
    return (
        <button
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

const fs = require("node:fs");

// 1. Quotas.tsx
let quotas = fs.readFileSync("src/pages/Quotas.tsx", "utf8");
quotas = quotas.replace(
	'import { useAuth } from "../stores/auth";',
	'import { useAuth } from "@clerk/clerk-react";',
);
quotas = quotas.replace(
	"const { token } = useAuth();",
	"const { getToken } = useAuth();",
);
quotas = quotas.replace(
	/const headers = \{[\s\S]*?\};/,
	`const getHeaders = async () => ({\n\t\t"Content-Type": "application/json",\n\t\tAuthorization: \`Bearer \${await getToken()}\`,\n\t});`,
);
quotas = quotas.replace(/headers,/g, "headers: await getHeaders(),");
// Fix the fetch payload headers if any were inline. Wait, we replaced `headers,` which works for `fetch(url, { method: "POST", headers, body... })`.
fs.writeFileSync("src/pages/Quotas.tsx", quotas);

// 2. SidebarLayout.tsx
let sidebar = fs.readFileSync("src/components/SidebarLayout.tsx", "utf8");
sidebar = sidebar.replace(
	'import { useAuth } from "../stores/auth";',
	'import { useAuth, UserButton } from "@clerk/clerk-react";',
);
sidebar = sidebar.replace(
	"const { token } = useAuth();",
	"const { getToken } = useAuth();",
);
sidebar = sidebar.replace(
	/if \(!hasPrefetched\.current && token\) \{[\s\S]*?hasPrefetched\.current = true;/,
	`if (!hasPrefetched.current) {\n\t\t\thasPrefetched.current = true;\n\t\t\tgetToken().then((token) => {\n\t\t\t\tif (!token) return;`,
);
sidebar = sidebar.replace(
	/\.catch\(\(\) => \{\}\);\n\t\t\}/,
	`.catch(() => {});\n\t\t\t});\n\t\t}`,
);
// Add UserButton
sidebar = sidebar.replace(
	/<div className="flex h-16 shrink-0 items-center">\n\t\t\t\t\t\t\t\t<Logo \/>\n\t\t\t\t\t\t\t<\/div>/,
	`<div className="flex h-16 shrink-0 items-center justify-between w-full">\n\t\t\t\t\t\t\t\t<Logo />\n\t\t\t\t\t\t\t\t<UserButton />\n\t\t\t\t\t\t\t</div>`,
);
sidebar = sidebar.replace(
	/<div className="flex h-16 shrink-0 items-center">\n\t\t\t\t\t\t<Logo \/>\n\t\t\t\t\t<\/div>/,
	`<div className="flex h-16 shrink-0 items-center justify-between w-full">\n\t\t\t\t\t\t<Logo />\n\t\t\t\t\t\t<UserButton />\n\t\t\t\t\t</div>`,
);
fs.writeFileSync("src/components/SidebarLayout.tsx", sidebar);

// 3. App.tsx
let app = fs.readFileSync("src/App.tsx", "utf8");
app = app.replace(
	'import { useAuth } from "./stores/auth";',
	'import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";',
);
app = app.replace(
	/const ProtectedRoute = \(\{ children \}: \{ children: React\.ReactNode \}\) => \{[\s\S]*?return <>\S+children\S+<\/>;\n\};/,
	`const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
	return (
		<>
			<SignedIn>
				{children}
			</SignedIn>
			<SignedOut>
				<RedirectToSignIn redirectUrl="/login" />
			</SignedOut>
		</>
	);
};`,
);
fs.writeFileSync("src/App.tsx", app);

// 4. main.tsx
let main = fs.readFileSync("src/main.tsx", "utf8");
main = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
import "./locales/i18n";
import { ClerkProvider } from "@clerk/clerk-react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
	throw new Error("Missing Clerk Publishable Key");
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

createRoot(rootElement).render(
	<StrictMode>
		<ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</ClerkProvider>
	</StrictMode>,
);
`;
fs.writeFileSync("src/main.tsx", main);

// 5. Login.tsx
let login = fs.readFileSync("src/pages/Login.tsx", "utf8");
login = `import { SignIn } from "@clerk/clerk-react";
import { LanguageSelector } from "../components/LanguageSelector";
import { ThemeToggle } from "../components/ThemeToggle";
import { Logo } from "../components/Logo";

export function Login() {
	return (
		<div className="flex min-h-screen flex-1 flex-col justify-center px-6 py-12 lg:px-8 bg-gray-50 dark:bg-gray-900 transition-colors">
			<div className="absolute top-4 right-4 flex items-center gap-4">
				<ThemeToggle />
				<LanguageSelector />
			</div>
			<div className="sm:mx-auto sm:w-full sm:max-w-sm flex flex-col items-center mb-8">
				<Logo size="lg" />
			</div>
			<div className="mx-auto">
				<SignIn routing="path" path="/login" />
			</div>
		</div>
	);
}
`;
fs.writeFileSync("src/pages/Login.tsx", login);

console.log("Rewrite complete.");

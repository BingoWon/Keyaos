import { useEffect } from "react";
import {
	createBrowserRouter,
	Navigate,
	useLocation,
	useNavigate,
} from "react-router-dom";
import { AuthGuard, isPlatform, useAuth } from "./auth";
import { SidebarLayout } from "./components/SidebarLayout";
import { ApiKeys } from "./pages/ApiKeys";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { Data } from "./pages/admin/Data";
import { Overview } from "./pages/admin/Overview";
import { Users } from "./pages/admin/Users";
import { Billing } from "./pages/Billing";
import { Byok } from "./pages/Byok";
import { Dashboard } from "./pages/Dashboard";
import { DesignSystem } from "./pages/DesignSystem";
import ContactMdx from "./pages/docs/contact.mdx";
import { DocsLayout } from "./pages/docs/DocsLayout";
import { MdxPage } from "./pages/docs/MdxPage";
import PricingMdx from "./pages/docs/pricing.mdx";
import PrivacyMdx from "./pages/docs/privacy.mdx";
import QuickstartMdx from "./pages/docs/quickstart.mdx";
import TermsMdx from "./pages/docs/terms.mdx";
import { Landing } from "./pages/Landing";
import { Ledger } from "./pages/Ledger";
import { Login } from "./pages/Login";
import { Models } from "./pages/Models";
import { NotFound } from "./pages/NotFound";
import { Providers } from "./pages/Providers";
import { Usage } from "./pages/Usage";

const dashboardChildren = [
	{ index: true, element: <Dashboard /> },
	{ path: "models", element: <Models /> },
	{ path: "providers", element: <Providers /> },
	{ path: "api-keys", element: <ApiKeys /> },
	{ path: "byok", element: <Byok /> },
	{ path: "usage", element: <Usage /> },
	...(isPlatform
		? [
				{ path: "ledger", element: <Ledger /> },
				{ path: "billing", element: <Billing /> },
			]
		: []),
];

function LoginRoute() {
	const { isLoaded, isSignedIn } = useAuth();
	const { pathname } = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		if (isLoaded && isSignedIn && pathname === "/login") {
			navigate("/dashboard", { replace: true });
		}
	}, [isLoaded, isSignedIn, pathname, navigate]);

	return <Login />;
}

export const router = createBrowserRouter([
	{
		path: "/login/*",
		element: <LoginRoute />,
	},
	{ path: "/", element: <Landing /> },
	{
		path: "/dashboard",
		element: (
			<AuthGuard fallback={<Navigate to="/login" replace />}>
				<SidebarLayout />
			</AuthGuard>
		),
		children: dashboardChildren,
	},
	...(isPlatform
		? [
				{
					path: "/admin",
					element: (
						<AuthGuard fallback={<Navigate to="/login" replace />}>
							<AdminLayout />
						</AuthGuard>
					),
					children: [
						{ index: true, element: <Overview /> },
						{ path: "users", element: <Users /> },
						{ path: "data", element: <Data /> },
					],
				},
			]
		: []),
	{ path: "/design", element: <DesignSystem /> },
	{
		path: "/docs",
		element: <DocsLayout />,
		children: [
			{ index: true, element: <Navigate to="/docs/quickstart" replace /> },
			{ path: "quickstart", element: <MdxPage Component={QuickstartMdx} /> },
			{ path: "pricing", element: <MdxPage Component={PricingMdx} /> },
			{ path: "privacy", element: <MdxPage Component={PrivacyMdx} /> },
			{ path: "terms", element: <MdxPage Component={TermsMdx} /> },
			{ path: "contact", element: <MdxPage Component={ContactMdx} /> },
		],
	},
	{ path: "*", element: <NotFound /> },
]);

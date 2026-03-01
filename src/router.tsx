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
import { Byok } from "./pages/Byok";
import { Credits } from "./pages/Credits";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { Data } from "./pages/admin/Data";
import { Overview } from "./pages/admin/Overview";
import { Users } from "./pages/admin/Users";
import { Dashboard } from "./pages/Dashboard";
import { DesignSystem } from "./pages/DesignSystem";
import AnthropicApiMdx from "./pages/docs/anthropic-api.mdx";
import AuthenticationMdx from "./pages/docs/authentication.mdx";
import BillingMdx from "./pages/docs/billing.mdx";
import ContactMdx from "./pages/docs/contact.mdx";
import CredentialsSharingMdx from "./pages/docs/credentials-sharing.mdx";
import CreditsApiMdx from "./pages/docs/credits-api.mdx";
import { DocsLayout } from "./pages/docs/DocsLayout";
import ErrorCodesMdx from "./pages/docs/error-codes.mdx";
import IntroductionMdx from "./pages/docs/introduction.mdx";
import { MdxPage } from "./pages/docs/MdxPage";
import ModelsApiMdx from "./pages/docs/models-api.mdx";
import ModelsRoutingMdx from "./pages/docs/models-routing.mdx";
import OpenaiApiMdx from "./pages/docs/openai-api.mdx";
import PricingMdx from "./pages/docs/pricing.mdx";
import PrivacyPolicyMdx from "./pages/docs/privacy-policy.mdx";
import QuickstartMdx from "./pages/docs/quickstart.mdx";
import TermsOfServiceMdx from "./pages/docs/terms-of-service.mdx";
import { Landing } from "./pages/Landing";
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
		? [{ path: "credits", element: <Credits /> }]
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
			{ index: true, element: <Navigate to="/docs/introduction" replace /> },
			{
				path: "introduction",
				element: <MdxPage Component={IntroductionMdx} />,
			},
			{ path: "quickstart", element: <MdxPage Component={QuickstartMdx} /> },
			{
				path: "models-routing",
				element: <MdxPage Component={ModelsRoutingMdx} />,
			},
			{
				path: "credentials-sharing",
				element: <MdxPage Component={CredentialsSharingMdx} />,
			},
			{ path: "pricing", element: <MdxPage Component={PricingMdx} /> },
			{ path: "billing", element: <MdxPage Component={BillingMdx} /> },
			{
				path: "authentication",
				element: <MdxPage Component={AuthenticationMdx} />,
			},
			{ path: "openai-api", element: <MdxPage Component={OpenaiApiMdx} /> },
			{ path: "models-api", element: <MdxPage Component={ModelsApiMdx} /> },
			{ path: "credits-api", element: <MdxPage Component={CreditsApiMdx} /> },
			{
				path: "anthropic-api",
				element: <MdxPage Component={AnthropicApiMdx} />,
			},
			{ path: "error-codes", element: <MdxPage Component={ErrorCodesMdx} /> },
			{
				path: "privacy-policy",
				element: <MdxPage Component={PrivacyPolicyMdx} />,
			},
			{
				path: "terms-of-service",
				element: <MdxPage Component={TermsOfServiceMdx} />,
			},
			{ path: "contact", element: <MdxPage Component={ContactMdx} /> },
		],
	},
	{ path: "*", element: <NotFound /> },
]);

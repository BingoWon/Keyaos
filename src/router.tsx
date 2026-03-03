import { Suspense, lazy, useEffect } from "react";
import {
	createBrowserRouter,
	Navigate,
	useLocation,
	useNavigate,
} from "react-router-dom";
import { AuthGuard, isPlatform, useAuth } from "./auth";
import { PageLoader } from "./components/PageLoader";
import { SidebarLayout } from "./components/SidebarLayout";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { MdxPage } from "./pages/docs/MdxPage";
import { NotFound } from "./pages/NotFound";

// ─── Lazy-loaded page components ─────────────────────────

const Dashboard = lazy(() =>
	import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const Models = lazy(() =>
	import("./pages/Models").then((m) => ({ default: m.Models })),
);
const Providers = lazy(() =>
	import("./pages/Providers").then((m) => ({ default: m.Providers })),
);
const ApiKeys = lazy(() =>
	import("./pages/ApiKeys").then((m) => ({ default: m.ApiKeys })),
);
const Byok = lazy(() =>
	import("./pages/Byok").then((m) => ({ default: m.Byok })),
);
const Logs = lazy(() =>
	import("./pages/Logs").then((m) => ({ default: m.Logs })),
);
const Credits = lazy(() =>
	import("./pages/Credits").then((m) => ({ default: m.Credits })),
);
const DesignSystem = lazy(() =>
	import("./pages/DesignSystem").then((m) => ({ default: m.DesignSystem })),
);

// ─── Lazy-loaded admin pages ─────────────────────────────

const AdminLayout = lazy(() =>
	import("./pages/admin/AdminLayout").then((m) => ({
		default: m.AdminLayout,
	})),
);
const Overview = lazy(() =>
	import("./pages/admin/Overview").then((m) => ({ default: m.Overview })),
);
const Users = lazy(() =>
	import("./pages/admin/Users").then((m) => ({ default: m.Users })),
);
const Data = lazy(() =>
	import("./pages/admin/Data").then((m) => ({ default: m.Data })),
);

// ─── Lazy-loaded docs ────────────────────────────────────

const DocsLayout = lazy(() =>
	import("./pages/docs/DocsLayout").then((m) => ({ default: m.DocsLayout })),
);
const IntroductionMdx = lazy(() => import("./pages/docs/introduction.mdx"));
const QuickstartMdx = lazy(() => import("./pages/docs/quickstart.mdx"));
const ModelsRoutingMdx = lazy(
	() => import("./pages/docs/models-routing.mdx"),
);
const CredentialsSharingMdx = lazy(
	() => import("./pages/docs/credentials-sharing.mdx"),
);
const PricingMdx = lazy(() => import("./pages/docs/pricing.mdx"));
const CreditsMdx = lazy(() => import("./pages/docs/credits.mdx"));
const AuthenticationMdx = lazy(
	() => import("./pages/docs/authentication.mdx"),
);
const OpenaiApiMdx = lazy(() => import("./pages/docs/openai-api.mdx"));
const AnthropicApiMdx = lazy(() => import("./pages/docs/anthropic-api.mdx"));
const ModelsApiMdx = lazy(() => import("./pages/docs/models-api.mdx"));
const CreditsApiMdx = lazy(() => import("./pages/docs/credits-api.mdx"));
const ErrorCodesMdx = lazy(() => import("./pages/docs/error-codes.mdx"));
const PrivacyPolicyMdx = lazy(
	() => import("./pages/docs/privacy-policy.mdx"),
);
const TermsOfServiceMdx = lazy(
	() => import("./pages/docs/terms-of-service.mdx"),
);
const ContactMdx = lazy(() => import("./pages/docs/contact.mdx"));

// ─── Route definitions ───────────────────────────────────

const dashboardChildren = [
	{ index: true, element: <Dashboard /> },
	{ path: "models", element: <Models /> },
	{ path: "providers", element: <Providers /> },
	{ path: "api-keys", element: <ApiKeys /> },
	{ path: "byok", element: <Byok /> },
	{ path: "logs", element: <Logs /> },
	...(isPlatform ? [{ path: "credits", element: <Credits /> }] : []),
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
	{ path: "/login/*", element: <LoginRoute /> },
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
							<Suspense fallback={<PageLoader />}>
								<AdminLayout />
							</Suspense>
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
	{
		path: "/design",
		element: (
			<Suspense fallback={<PageLoader />}>
				<DesignSystem />
			</Suspense>
		),
	},
	{
		path: "/docs",
		element: (
			<Suspense fallback={<PageLoader />}>
				<DocsLayout />
			</Suspense>
		),
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
			{ path: "credits", element: <MdxPage Component={CreditsMdx} /> },
			{
				path: "authentication",
				element: <MdxPage Component={AuthenticationMdx} />,
			},
			{ path: "openai-api", element: <MdxPage Component={OpenaiApiMdx} /> },
			{
				path: "anthropic-api",
				element: <MdxPage Component={AnthropicApiMdx} />,
			},
			{ path: "models-api", element: <MdxPage Component={ModelsApiMdx} /> },
			{ path: "credits-api", element: <MdxPage Component={CreditsApiMdx} /> },
			{
				path: "error-codes",
				element: <MdxPage Component={ErrorCodesMdx} />,
			},
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

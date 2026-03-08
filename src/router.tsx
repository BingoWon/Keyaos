import { Suspense, useEffect } from "react";
import {
	createBrowserRouter,
	Navigate,
	Outlet,
	ScrollRestoration,
	useLocation,
	useNavigate,
} from "react-router-dom";
import { AuthGuard, isPlatform, useAuth } from "./auth";
import { PageLoader } from "./components/PageLoader";
import { RouteError } from "./components/RouteError";
import { TopNav } from "./components/TopNav";
import { MdxPage } from "./pages/docs/MdxPage";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { NotFound } from "./pages/NotFound";
import { lazyWithRetry } from "./utils/lazyWithRetry";

// ─── Lazy-loaded page components ─────────────────────────

const Dashboard = lazyWithRetry(() =>
	import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const Models = lazyWithRetry(() =>
	import("./pages/Models").then((m) => ({ default: m.Models })),
);
const ModelDetail = lazyWithRetry(() =>
	import("./pages/ModelDetail").then((m) => ({ default: m.ModelDetail })),
);
const Providers = lazyWithRetry(() =>
	import("./pages/Providers").then((m) => ({ default: m.Providers })),
);
const ProviderDetail = lazyWithRetry(() =>
	import("./pages/ProviderDetail").then((m) => ({
		default: m.ProviderDetail,
	})),
);
const ApiKeys = lazyWithRetry(() =>
	import("./pages/ApiKeys").then((m) => ({ default: m.ApiKeys })),
);
const Byok = lazyWithRetry(() =>
	import("./pages/Byok").then((m) => ({ default: m.Byok })),
);
const Logs = lazyWithRetry(() =>
	import("./pages/Logs").then((m) => ({ default: m.Logs })),
);
const Credits = lazyWithRetry(() =>
	import("./pages/Credits").then((m) => ({ default: m.Credits })),
);
const Chat = lazyWithRetry(() =>
	import("./pages/Chat").then((m) => ({ default: m.Chat })),
);
const DesignSystem = lazyWithRetry(() =>
	import("./pages/DesignSystem").then((m) => ({ default: m.DesignSystem })),
);
const WerewolfGame = lazyWithRetry(() => import("./werewolf/WerewolfEntry"));

// ─── Lazy-loaded admin pages ─────────────────────────────

const AdminLayout = lazyWithRetry(() =>
	import("./pages/admin/AdminLayout").then((m) => ({
		default: m.AdminLayout,
	})),
);
const Overview = lazyWithRetry(() =>
	import("./pages/admin/Overview").then((m) => ({ default: m.Overview })),
);
const Users = lazyWithRetry(() =>
	import("./pages/admin/Users").then((m) => ({ default: m.Users })),
);
const Data = lazyWithRetry(() =>
	import("./pages/admin/Data").then((m) => ({ default: m.Data })),
);

// ─── Lazy-loaded layouts ─────────────────────────────────

const SidebarLayout = lazyWithRetry(() =>
	import("./components/SidebarLayout").then((m) => ({
		default: m.SidebarLayout,
	})),
);

// ─── Lazy-loaded docs ────────────────────────────────────

const DocsLayout = lazyWithRetry(() =>
	import("./pages/docs/DocsLayout").then((m) => ({ default: m.DocsLayout })),
);
const IntroductionMdx = lazyWithRetry(
	() => import("./pages/docs/introduction.mdx"),
);
const QuickstartMdx = lazyWithRetry(
	() => import("./pages/docs/quickstart.mdx"),
);
const ModelsRoutingMdx = lazyWithRetry(
	() => import("./pages/docs/models-routing.mdx"),
);
const CredentialsSharingMdx = lazyWithRetry(
	() => import("./pages/docs/credentials-sharing.mdx"),
);
const PricingMdx = lazyWithRetry(() => import("./pages/docs/pricing.mdx"));
const CreditsMdx = lazyWithRetry(() => import("./pages/docs/credits.mdx"));
const AuthenticationMdx = lazyWithRetry(
	() => import("./pages/docs/authentication.mdx"),
);
const PrivacyPolicyMdx = lazyWithRetry(
	() => import("./pages/docs/privacy-policy.mdx"),
);
const TermsOfServiceMdx = lazyWithRetry(
	() => import("./pages/docs/terms-of-service.mdx"),
);
const ContactMdx = lazyWithRetry(() => import("./pages/docs/contact.mdx"));
const ApiReference = lazyWithRetry(() =>
	import("./pages/docs/ApiReference").then((m) => ({
		default: m.ApiReference,
	})),
);

// ─── Shared layouts ──────────────────────────────────────

function AppLayout() {
	return (
		<>
			<TopNav />
			<ScrollRestoration />
			<Outlet />
		</>
	);
}

function ContentShell() {
	return (
		<main className="min-h-dvh pt-24 pb-10">
			<div className="mx-auto max-w-screen-2xl px-6 sm:px-8 lg:px-12">
				<Suspense fallback={<PageLoader />}>
					<Outlet />
				</Suspense>
			</div>
		</main>
	);
}

// ─── Login route ─────────────────────────────────────────

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

// ─── Dashboard children ──────────────────────────────────

const dashboardChildren = [
	{ index: true, element: <Dashboard /> },
	{ path: "byok", element: <Byok /> },
	{ path: "api-keys", element: <ApiKeys /> },
	{ path: "logs", element: <Logs /> },
	...(isPlatform ? [{ path: "credits", element: <Credits /> }] : []),
];

// ─── Docs children ───────────────────────────────────────

const docsChildren = [
	{ index: true, element: <Navigate to="/docs/introduction" replace /> },
	{ path: "introduction", element: <MdxPage Component={IntroductionMdx} /> },
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
	{ path: "api-reference", element: <ApiReference /> },
	{
		path: "privacy-policy",
		element: <MdxPage Component={PrivacyPolicyMdx} />,
	},
	{
		path: "terms-of-service",
		element: <MdxPage Component={TermsOfServiceMdx} />,
	},
	{ path: "contact", element: <MdxPage Component={ContactMdx} /> },
];

// ─── Route definitions ───────────────────────────────────

export const router = createBrowserRouter([
	{ path: "/", element: <Landing /> },
	{
		element: <AppLayout />,
		errorElement: <RouteError />,
		children: [
			{ path: "/login/*", element: <LoginRoute /> },

			{
				element: <ContentShell />,
				children: [
					{ path: "/models", element: <Models /> },
					{ path: "/providers", element: <Providers /> },
					{
						path: "/providers/:providerId",
						element: <ProviderDetail />,
					},
					{ path: "/:org/:model", element: <ModelDetail /> },
				],
			},

			{
				path: "/chat",
				element: (
					<AuthGuard fallback={<Navigate to="/login" replace />}>
						<Suspense fallback={<PageLoader />}>
							<Chat />
						</Suspense>
					</AuthGuard>
				),
			},

			{
				path: "/werewolf",
				element: (
					<AuthGuard fallback={<Navigate to="/login" replace />}>
						<Suspense fallback={<PageLoader />}>
							<WerewolfGame />
						</Suspense>
					</AuthGuard>
				),
			},

			{
				path: "/docs",
				element: (
					<Suspense fallback={<PageLoader />}>
						<DocsLayout />
					</Suspense>
				),
				children: docsChildren,
			},

			{
				path: "/dashboard",
				element: (
					<AuthGuard fallback={<Navigate to="/login" replace />}>
						<Suspense fallback={<PageLoader />}>
							<SidebarLayout />
						</Suspense>
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

			{ path: "*", element: <NotFound /> },
		],
	},
]);

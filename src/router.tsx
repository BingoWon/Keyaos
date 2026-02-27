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
import { Guide } from "./pages/Guide";
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
	{ path: "guide", element: <Guide /> },
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
	{ path: "*", element: <NotFound /> },
]);

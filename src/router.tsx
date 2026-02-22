import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthGuard, isPlatform } from "./auth";
import { SidebarLayout } from "./components/SidebarLayout";
import { ApiKeys } from "./pages/ApiKeys";
import { Billing } from "./pages/Billing";
import { Credentials } from "./pages/Credentials";
import { Dashboard } from "./pages/Dashboard";
import { Guide } from "./pages/Guide";
import { Ledger } from "./pages/Ledger";
import { Login } from "./pages/Login";
import { Models } from "./pages/Models";
import { NotFound } from "./pages/NotFound";

const dashboardChildren = [
	{ index: true, element: <Dashboard /> },
	{ path: "models", element: <Models /> },
	{ path: "api-keys", element: <ApiKeys /> },
	{ path: "credentials", element: <Credentials /> },
	{ path: "ledger", element: <Ledger /> },
	{ path: "guide", element: <Guide /> },
	...(isPlatform ? [{ path: "billing", element: <Billing /> }] : []),
];

export const router = createBrowserRouter([
	{
		path: "/login/*",
		element: (
			<AuthGuard fallback={<Login />}>
				<Navigate to="/dashboard" replace />
			</AuthGuard>
		),
	},
	{ path: "/", element: <Navigate to="/dashboard" replace /> },
	{
		path: "/dashboard",
		element: (
			<AuthGuard fallback={<Navigate to="/login" replace />}>
				<SidebarLayout />
			</AuthGuard>
		),
		children: dashboardChildren,
	},
	{ path: "*", element: <NotFound /> },
]);

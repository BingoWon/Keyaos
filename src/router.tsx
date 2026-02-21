import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthGuard } from "./auth";
import { SidebarLayout } from "./components/SidebarLayout";
import { Dashboard } from "./pages/Dashboard";
import { Guide } from "./pages/Guide";
import { Ledger } from "./pages/Ledger";
import { Quotas } from "./pages/Quotas";
import { Login } from "./pages/Login";
import { Market } from "./pages/Market";
import { ApiKeys } from "./pages/ApiKeys";
import { NotFound } from "./pages/NotFound";

export const router = createBrowserRouter([
    // Public
    {
        path: "/login/*",
        element: (
            <AuthGuard fallback={<Login />}>
                <Navigate to="/dashboard" replace />
            </AuthGuard>
        ),
    },

    // Landing page placeholder → dashboard
    { path: "/", element: <Navigate to="/dashboard" replace /> },

    // Protected dashboard
    {
        path: "/dashboard",
        element: (
            <AuthGuard fallback={<Navigate to="/login" replace />}>
                <SidebarLayout />
            </AuthGuard>
        ),
        children: [
            { index: true, element: <Dashboard /> },
            { path: "market", element: <Market /> },
            { path: "api-keys", element: <ApiKeys /> },
            { path: "quotas", element: <Quotas /> },
            { path: "ledger", element: <Ledger /> },
            { path: "guide", element: <Guide /> },
        ],
    },

    // Catch-all
    { path: "*", element: <NotFound /> },
]);

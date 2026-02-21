import { Toaster } from "react-hot-toast";
import { Navigate, Route, Routes } from "react-router-dom";
import { SidebarLayout } from "./components/SidebarLayout";
import { ApiKeys } from "./pages/ApiKeys";
import { Dashboard } from "./pages/Dashboard";
import { Guide } from "./pages/Guide";
import { Ledger } from "./pages/Ledger";
import { Quotas } from "./pages/Quotas";
import { Login } from "./pages/Login";
import { Market } from "./pages/Market";
import { NotFound } from "./pages/NotFound";
import { AuthGuard } from "./auth";

export default function App() {
	return (
		<>
			<Routes>
				<Route path="/login/*" element={<Login />} />
				<Route
					path="/"
					element={
						<AuthGuard fallback={<Navigate to="/login" replace />}>
							<SidebarLayout />
						</AuthGuard>
					}
				>
					<Route index element={<Dashboard />} />
					<Route path="market" element={<Market />} />
					<Route path="api-keys" element={<ApiKeys />} />
					<Route path="quotas" element={<Quotas />} />
					<Route path="ledger" element={<Ledger />} />
					<Route path="guide" element={<Guide />} />
				</Route>
				<Route path="*" element={<NotFound />} />
			</Routes>
			<Toaster position="top-right" />
		</>
	);
}

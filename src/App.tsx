import { Toaster } from "react-hot-toast";
import { Navigate, Route, Routes } from "react-router-dom";
import { SidebarLayout } from "./components/SidebarLayout";
import { Dashboard } from "./pages/Dashboard";
import { Keys } from "./pages/Keys";
import { Login } from "./pages/Login";
import { NotFound } from "./pages/NotFound";
import { AuthProvider, useAuth } from "./stores/auth";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
	const { isAuthenticated } = useAuth();
	if (!isAuthenticated) {
		return <Navigate to="/login" replace />;
	}
	return <>{children}</>;
};

export default function App() {
	return (
		<AuthProvider>
			<Routes>
				<Route path="/login" element={<Login />} />
				<Route
					path="/"
					element={
						<ProtectedRoute>
							<SidebarLayout />
						</ProtectedRoute>
					}
				>
					<Route index element={<Dashboard />} />
					<Route path="keys" element={<Keys />} />
					{/* Add more authenticated routes here */}
				</Route>
				<Route path="*" element={<NotFound />} />
			</Routes>
			<Toaster position="top-right" />
		</AuthProvider>
	);
}

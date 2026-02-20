import { createContext, useContext, useEffect, useState } from "react";

interface AuthContextType {
	isAuthenticated: boolean;
	login: (password: string) => boolean;
	logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		const auth = localStorage.getItem("keyaos-auth") === "true";
		setIsAuthenticated(auth);
		setIsInitialized(true);
	}, []);

	const login = (password: string) => {
		if (password === "admin") {
			localStorage.setItem("keyaos-auth", "true");
			setIsAuthenticated(true);
			return true;
		}
		return false;
	};

	const logout = () => {
		localStorage.removeItem("keyaos-auth");
		setIsAuthenticated(false);
	};

	if (!isInitialized) return null; // Or a global loading spinner

	return (
		<AuthContext.Provider value={{ isAuthenticated, login, logout }}>
			{children}
		</AuthContext.Provider>
	);
}

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) throw new Error("useAuth must be used within an AuthProvider");
	return context;
};

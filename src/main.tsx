import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
import "./locales/i18n";
import { AuthProvider } from "./auth";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

createRoot(rootElement).render(
	<StrictMode>
		<AuthProvider>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</AuthProvider>
	</StrictMode>,
);

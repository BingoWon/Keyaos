import { Crisp } from "crisp-sdk-web";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth";
import { router } from "./router";
import "./styles/globals.css";
import "./locales/i18n";

const crispId = import.meta.env.VITE_CRISP_WEBSITE_ID;
if (crispId) Crisp.configure(crispId);

const root = document.getElementById("root");
if (!root) throw new Error("Failed to find the root element");

createRoot(root).render(
	<StrictMode>
		<AuthProvider>
			<RouterProvider router={router} />
			<Toaster position="top-right" />
		</AuthProvider>
	</StrictMode>,
);

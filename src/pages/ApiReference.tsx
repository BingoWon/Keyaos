import { ApiReferenceReact } from "@scalar/api-reference-react";
// Vite resolves this to a hashed asset URL without injecting the CSS globally.
// We manage the <link> lifecycle ourselves so the styles are removed on unmount.
// @ts-expect-error Vite ?url suffix — see https://vite.dev/guide/assets#explicit-url-imports
import scalarCssUrl from "@scalar/api-reference-react/style.css?url";
import { useEffect, useState } from "react";

const NAV_HEIGHT = "56px";

const SCALAR_CSS = `
  .scalar-api-reference {
    --scalar-custom-header-height: ${NAV_HEIGHT};
    --full-height: calc(100dvh - ${NAV_HEIGHT});
  }
  .references-layout {
    min-height: calc(100dvh - ${NAV_HEIGHT}) !important;
  }
`;

export function ApiReference() {
	const [darkMode, setDarkMode] = useState(
		document.documentElement.classList.contains("dark"),
	);

	useEffect(() => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = scalarCssUrl;
		document.head.appendChild(link);
		return () => {
			link.remove();
		};
	}, []);

	useEffect(() => {
		const observer = new MutationObserver(() => {
			setDarkMode(document.documentElement.classList.contains("dark"));
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);

	return (
		<div className="pt-14 min-h-dvh">
			<ApiReferenceReact
				key={String(darkMode)}
				configuration={{
					url: "/openapi.json",
					darkMode,
					customCss: SCALAR_CSS,
					metaData: {
						title: "Keyaos API Reference",
					},
				}}
			/>
		</div>
	);
}

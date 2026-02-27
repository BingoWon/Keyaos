import { cloudflare } from "@cloudflare/vite-plugin";
import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import remarkGfm from "remark-gfm";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare(),
		tailwindcss(),
		mdx({ remarkPlugins: [remarkGfm] }),
		react({ include: /\.(jsx|tsx|mdx)$/ }),
	],
	resolve: {
		alias: {
			"@": "/src",
		},
	},
	server: {
		port: 5173,
	},
});

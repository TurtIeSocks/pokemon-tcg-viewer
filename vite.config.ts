import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	server: { port: 3000 },
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	plugins: [
		tailwindcss(),
		tanstackStart({
			srcDirectory: "src",
			prerender: {
				enabled: true,
				crawlLinks: true,
				// Prerender only the home + single-segment series pages. Sets/cards
				// stay SSR + SWR (rendered on demand, cached at the edge/nginx).
				filter: ({ path }) => {
					const segments = path.split("/").filter(Boolean);
					return segments.length <= 1;
				},
				failOnError: true,
			},
		}),
		viteReact(),
		nitro(),
	],
});

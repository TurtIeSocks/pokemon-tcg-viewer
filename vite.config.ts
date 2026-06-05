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
			// Colocated *.test.tsx files under routes/ aren't routes — stop the route
			// generator warning about them (they were already excluded from the tree).
			router: { routeFileIgnorePattern: "\\.(test|spec)\\." },
			prerender: {
				enabled: true,
				crawlLinks: true,
				filter: ({ path }) => {
					const segments = path.split("/").filter(Boolean);
					// Prerender home (0), series (1), and set (2) pages. Card pages (3)
					// stay SSR-on-demand. Search/collection are excluded below.
					if (
						segments[0] === "search" ||
						segments[0] === "collection" ||
						segments[0] === "pokemon"
					)
						return false;
					return segments.length <= 2;
				},
				failOnError: true,
			},
		}),
		viteReact(),
		nitro(),
	],
});

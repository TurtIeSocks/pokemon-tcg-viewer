import { fileURLToPath } from "node:url";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { versionPlugin } from "./src/lib/version-check/vite-plugin-version";

export default defineConfig({
	server: { port: 3000 },
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	// R6: the private billing plugin is never bundled. Combined with the runtime-
	// computed import specifier in load-plugin.ts, this lets `vite build` succeed
	// with @tcgvault/cloud absent (the open-core default).
	ssr: { external: ["@tcgvault/cloud"] },
	plugins: [
		// Must run first so its compilation of src/paraglide completes before
		// other plugins (e.g. tanstackStart's route generator) try to resolve it.
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			strategy: ["cookie", "preferredLanguage", "baseLocale"],
			// cookieName has no CLI equivalent, so the `paraglide`/`postinstall`
			// compile scripts emit the stock cookie name. This vite build is the
			// authoritative one for dev + prod (`vite build`), so the running app
			// always reads `ui-lang`; the CLI compile only scaffolds src/paraglide
			// for tsc/test (which don't exercise the cookie), then vite overwrites it.
			cookieName: "ui-lang",
		}),
		// Next so its dev middleware registers ahead of nitro's catch-all
		// (otherwise GET /version.json falls through to the SPA handler → 404).
		versionPlugin(),
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

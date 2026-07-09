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
			// i18n: locale lives only in the ui-lang cookie (no URL segment), so a
			// single prerendered file can't represent 12 locales without colliding.
			// Full SSR renders every route in the request locale. SSR HTML stays
			// fully crawlable, so SEO is unaffected; only static-edge caching is lost.
			prerender: { enabled: false },
		}),
		viteReact(),
		nitro(),
	],
});

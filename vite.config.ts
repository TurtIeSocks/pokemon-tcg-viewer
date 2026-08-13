import { fileURLToPath } from "node:url";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { versionPlugin } from "./src/lib/version-check/vite-plugin-version";

export default defineConfig({
	// PORT: honored so Claude Preview's autoPort can run several sessions'
	// dev servers side by side (each gets its own assigned port).
	server: { port: Number(process.env.PORT) || 3000 },
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
			// Both compile paths (this plugin + the CLI postinstall scaffold) must
			// emit .d.ts, or whichever runs last leaves src/paraglide untyped and
			// `tsc -b` fails with TS7016 on every @/paraglide import.
			emitTsDeclarations: true,
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
		// Pre-compress public assets at build time (.gz + .br siblings, which the
		// node-server then serves by Accept-Encoding). Nitro compresses nothing at
		// runtime and its docs push that job onto an edge CDN — which is exactly
		// what deploy/nginx/tcg.conf's `gzip on` was doing. A container deploy has
		// no nginx, so without this the two render-blocking stylesheets on `/`
		// ship at 290 KB instead of 40 KB and the page paints white until they
		// land. Pre-compressing costs build seconds and zero request-time CPU.
		// Harmless to the nginx path, which serves those files off disk itself.
		nitro({ compressPublicAssets: { gzip: true, brotli: true } }),
	],
});

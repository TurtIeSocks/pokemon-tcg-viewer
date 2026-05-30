import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

export default defineConfig({
	base: "/pokemon-tcg-viewer/",
	server: {
		port: 6201,
	},
	plugins: [
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["favicon.svg"],
			manifest: {
				name: "Pokémon TCG Holo Playground",
				short_name: "Holo TCG",
				description: "Interactive Pokémon TCG card viewer",
				theme_color: "#0f0823",
				background_color: "#0f0823",
				display: "standalone",
				start_url: "/pokemon-tcg-viewer/",
				scope: "/pokemon-tcg-viewer/",
				icons: [
					{ src: "icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "icon-512.png", sizes: "512x512", type: "image/png" },
					{
						src: "icon-512-maskable.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				navigateFallback: "/pokemon-tcg-viewer/index.html",
				runtimeCaching: [
					{
						urlPattern: ({ url }) => url.pathname.startsWith("/v2/"),
						handler: "StaleWhileRevalidate",
						options: {
							cacheName: "pokemontcg-api",
							expiration: { maxEntries: 200, maxAgeSeconds: SEVEN_DAYS },
						},
					},
					{
						urlPattern: /^https:\/\/images\.pokemontcg\.io\//,
						handler: "CacheFirst",
						options: {
							cacheName: "pokemontcg-images",
							expiration: { maxEntries: 500, maxAgeSeconds: THIRTY_DAYS },
						},
					},
				],
			},
			devOptions: {
				enabled: true,
				type: "module",
				navigateFallback: "index.html",
			},
		}),
	],
});

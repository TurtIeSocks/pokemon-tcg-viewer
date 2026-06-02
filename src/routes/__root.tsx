import {
	ClientOnly,
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../app.css?url";
import { CardOverlay } from "../components/islands/card-overlay";
import { SidebarCollapsible } from "../components/islands/sidebar-collapsible";
import { AppToolbar } from "../components/shell/app-toolbar";
import { SidebarNav } from "../components/shell/sidebar-nav";
import { getNavTreeFn } from "../server/nav-tree";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Pokémon TCG Holo Playground" },
			{ name: "theme-color", content: "#0f0823" },
			{ name: "apple-mobile-web-app-capable", content: "yes" },
			{
				name: "apple-mobile-web-app-status-bar-style",
				content: "black-translucent",
			},
			{ property: "og:title", content: "Pokémon TCG Holo Playground" },
			{
				property: "og:description",
				content:
					"Browse the Pokémon TCG catalog with interactive holographic card effects.",
			},
			{ property: "og:type", content: "website" },
			// og:url omitted: prod domain isn't committed (self-hosted; nginx
			// server_name is a placeholder) and OG requires an absolute URL. The old
			// GitHub Pages URL is dead. Add the canonical absolute URL here once known.
			{ name: "twitter:card", content: "summary_large_image" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{
				rel: "preload",
				href: "/fonts/newsreader.woff2",
				as: "font",
				type: "font/woff2",
				crossOrigin: "anonymous",
			},
			{
				rel: "preload",
				href: "/fonts/jetbrains-mono.woff2",
				as: "font",
				type: "font/woff2",
				crossOrigin: "anonymous",
			},
			{ rel: "icon", type: "image/png", href: "/favicon-32.png" },
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				href: "/favicon-32.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "16x16",
				href: "/favicon-16.png",
			},
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
		],
	}),
	loader: () => getNavTreeFn(),
	component: RootComponent,
});

function RootComponent() {
	const tree = Route.useLoaderData();
	// Active slugs from the current path: /{series}/{set}/...
	const segments = useRouterState({
		select: (s) => s.location.pathname.split("/").filter(Boolean),
	});
	const activeSeriesSlug = segments[0] ?? null;
	const activeSetSlug = segments[1] ?? null;

	return (
		<RootDocument>
			<div className="flex h-screen flex-col overflow-hidden">
				<AppToolbar
					tree={tree}
					activeSeriesSlug={activeSeriesSlug}
					activeSetSlug={activeSetSlug}
				/>
				<div className="flex min-h-0 flex-1">
					<aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-sidebar lg:block">
						<ClientOnly
							fallback={
								<SidebarNav
									tree={tree}
									activeSeriesSlug={activeSeriesSlug}
									activeSetSlug={activeSetSlug}
								/>
							}
						>
							<SidebarCollapsible
								tree={tree}
								activeSeriesSlug={activeSeriesSlug}
								activeSetSlug={activeSetSlug}
							/>
						</ClientOnly>
					</aside>
					<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
						<Outlet />
					</main>
				</div>
			</div>
			<ClientOnly fallback={null}>
				<CardOverlay />
			</ClientOnly>
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}

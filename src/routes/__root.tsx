import {
	ClientOnly,
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import appCss from "../app.css?url";
import { CardOverlay } from "../components/islands/card-overlay";
import { AppSidebar } from "../components/shell/app-sidebar";
import { getNavTreeFn } from "../server/nav-tree";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Pokémon TCG Holo Playground" },
			{ name: "theme-color", content: "#0d0a16" },
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
				href: "/fonts/space-grotesk.woff2",
				as: "font",
				type: "font/woff2",
				crossOrigin: "anonymous",
			},
			{
				rel: "preload",
				href: "/fonts/geist-mono.woff2",
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
			<SidebarProvider defaultOpen={true}>
				<AppSidebar
					tree={tree}
					activeSeriesSlug={activeSeriesSlug}
					activeSetSlug={activeSetSlug}
				/>
				<SidebarInset>
					<header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--hairline)] px-4 backdrop-blur">
						<SidebarTrigger />
						<div className="flex min-w-0 flex-1 items-center gap-2">
							<span className="hidden font-display text-sm font-semibold sm:block">
								Pokémon TCG Viewer
							</span>
						</div>
					</header>
					<main className="flex-1 min-w-0 overflow-auto">
						<Outlet />
					</main>
				</SidebarInset>
			</SidebarProvider>
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

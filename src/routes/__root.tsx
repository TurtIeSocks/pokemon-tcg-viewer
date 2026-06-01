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
		],
		links: [{ rel: "stylesheet", href: appCss }],
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
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en">
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

import {
	ClientOnly,
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { type FormEvent, useCallback, useState } from "react";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import appCss from "../app.css?url";
import { CardOverlay } from "../components/islands/card-overlay";
import { AppSidebar } from "../components/shell/app-sidebar";
import { LIST_SEARCH_DEFAULTS } from "../lib/list-search";
import type { NavTree } from "../lib/nav-tree";
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

/** Derive human-readable breadcrumb segments from the current pathname + nav tree. */
function useBreadcrumb(tree: NavTree): string[] {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const parts = pathname.split("/").filter(Boolean);

	if (parts.length === 0) return ["Browse"];

	if (parts[0] === "vault") {
		const sub = parts[1];
		if (sub === "sets") return ["Vault", "Sets"];
		if (sub === "binders") return ["Vault", "Binders"];
		if (sub) return ["Vault", sub.charAt(0).toUpperCase() + sub.slice(1)];
		return ["Vault"];
	}

	if (parts[0] === "search") return ["Search"];

	// /{series}/{set}/{card?}
	const seriesSlug = parts[0];
	const setSlug = parts[1];
	const cardSlug = parts[2];

	const series = tree.find((s) => s.slug === seriesSlug);
	const set = series?.sets.find((s) => s.slug === setSlug);

	const crumbs: string[] = ["Browse"];
	if (series) crumbs.push(series.name);
	if (set) crumbs.push(set.name);
	if (cardSlug && cardSlug !== "manage") crumbs.push(cardSlug.toUpperCase());

	return crumbs;
}

function ShellHeader({ tree }: { tree: NavTree }) {
	const crumbs = useBreadcrumb(tree);
	const navigate = useNavigate();
	const [q, setQ] = useState("");

	const handleSearch = useCallback(
		(e: FormEvent) => {
			e.preventDefault();
			const trimmed = q.trim();
			if (!trimmed) return;
			void navigate({
				to: "/search",
				search: { ...LIST_SEARCH_DEFAULTS, q: trimmed },
			});
		},
		[q, navigate],
	);

	return (
		<header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--hairline)] px-4 backdrop-blur-md">
			<SidebarTrigger />

			{/* Breadcrumb */}
			<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
				{crumbs.map((crumb, i) => (
					<span
						key={`${i}-${crumb}`}
						className="flex items-center gap-1.5 min-w-0"
					>
						{i > 0 && (
							<span className="font-mono text-[var(--faint)] text-xs opacity-60 shrink-0">
								›
							</span>
						)}
						<span
							className={
								i === crumbs.length - 1
									? "truncate text-sm font-semibold text-[var(--ink)]"
									: "truncate text-sm text-[var(--faint)] hidden sm:block"
							}
						>
							{crumb}
						</span>
					</span>
				))}
			</div>

			{/* Search pill */}
			<form onSubmit={handleSearch} className="relative shrink-0">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-[var(--faint)] pointer-events-none" />
				<input
					type="search"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Search 20,000 cards…"
					className="h-8 w-48 rounded-[var(--r-pill)] bg-[var(--glass)] border border-[var(--border)] pl-7 pr-3 text-xs text-[var(--ink)] placeholder:text-[var(--faint)] outline-none focus:border-[var(--primary)] focus:ring-0 transition-colors sm:w-56"
				/>
			</form>
		</header>
	);
}

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
					<ShellHeader tree={tree} />
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

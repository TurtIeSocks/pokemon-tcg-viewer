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
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AboutDialog } from "@/components/shell/about-dialog";
import { RepoLink } from "@/components/shell/repo-link";
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
import { isCloudEnabled } from "../lib/supabase/client";
import { getNavTreeFn } from "../server/nav-tree";
import { subscribeAuth } from "../store/userland/userland-store";

export const Route = createRootRoute({
	loader: () => getNavTreeFn(),
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
			// Site-level OG url (homepage). Per-page routes can override in their own
			// head(); intentionally NOT a site-wide rel=canonical (a static one would
			// point every set/card page at the homepage and de-index them).
			{ property: "og:url", content: "https://ptcg.turtlesocks.dev" },
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

	// Unknown single segment (e.g. /profile) → just the capitalised label.
	if (!series && parts.length === 1) return [capitalize(seriesSlug)];

	const crumbs: string[] = ["Browse"];
	if (series) crumbs.push(series.name);
	if (set) crumbs.push(set.name);
	if (cardSlug && cardSlug !== "manage") crumbs.push(cardSlug.toUpperCase());

	return crumbs;
}

function ShellHeader({ tree }: { tree: NavTree }) {
	const crumbs = useBreadcrumb(tree);
	// Pair each label with a cumulative-path key so duplicate labels (e.g. a base
	// set sharing its series name) stay distinct without an array-index key.
	const crumbItems = crumbs.map((label, i) => ({
		label,
		key: crumbs.slice(0, i + 1).join(" / "),
		isFirst: i === 0,
		isLast: i === crumbs.length - 1,
	}));
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
		<header className="sticky top-0 z-30 flex h-14 items-center gap-2 justify-between border-b border-[var(--hairline)] px-4 backdrop-blur-md">
			<SidebarTrigger />

			{/* Breadcrumb */}
			<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
				{crumbItems.map((item) => (
					<span key={item.key} className="flex items-center gap-1.5 min-w-0">
						{!item.isFirst && (
							<span className="font-mono text-[var(--faint)] text-xs opacity-60 shrink-0">
								›
							</span>
						)}
						<span
							className={
								item.isLast
									? "truncate text-sm font-semibold text-[var(--ink)]"
									: "truncate text-sm text-[var(--faint)] hidden sm:block"
							}
						>
							{item.label}
						</span>
					</span>
				))}
			</div>

			{/* Search pill */}
			<form onSubmit={handleSearch} className="relative shrink-0">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-[var(--faint)] pointer-events-none" />
				<input
					type="search"
					aria-label="Search cards"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Search 20,000 cards…"
					className="h-8 w-48 rounded-[var(--r-pill)] bg-[var(--glass)] border border-[var(--border)] pl-7 pr-3 text-xs text-[var(--ink)] placeholder:text-[var(--faint)] outline-none focus:border-[var(--primary)] focus:ring-0 transition-colors sm:w-56"
				/>
			</form>
			<RepoLink />
			<AboutDialog />
		</header>
	);
}

function RootComponent() {
	const tree = Route.useLoaderData();

	// Wire Supabase auth listener once at app mount (client-side only).
	// No-ops when cloud is disabled (no env vars set).
	useEffect(() => {
		if (!isCloudEnabled()) return;
		void subscribeAuth();
	}, []);

	return (
		<RootDocument>
			<SidebarProvider defaultOpen={true}>
				<AppSidebar tree={tree} />
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

function capitalize(str: string): string {
	return `${str.slice(0, 1).toUpperCase()}${str.slice(1)}`;
}

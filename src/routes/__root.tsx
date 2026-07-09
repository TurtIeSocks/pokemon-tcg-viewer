import {
	ClientOnly,
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { PreviewLogin } from "@/components/dev/preview-login";
import { AboutDialog } from "@/components/shell/about-dialog";
import { CommandPalette } from "@/components/shell/command-palette";
import { RepoLink } from "@/components/shell/repo-link";
import { SyncToastsWatcher } from "@/components/sync/sync-toasts";
import { Button } from "@/components/ui/button";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import {
	parseSidebarState,
	readCookieValue,
	SIDEBAR_COOKIE_NAME,
} from "@/components/ui/sidebar-cookie";
import { Toaster } from "@/components/ui/sonner";
import { VersionToast } from "@/lib/version-check";
import appCss from "../app.css?url";
import { CardOverlay } from "../components/islands/card-overlay";
import { HeaderLanguageControl } from "../components/islands/header-language-control";
import { AppSidebar } from "../components/shell/app-sidebar";
import { BottomNav } from "../components/shell/bottom-nav";
import { bcp47 } from "../lib/bcp47";
import type { NavTree } from "../lib/nav-tree";
import { titleCaseSlug } from "../lib/slug";
import { isCloudEnabled } from "../lib/supabase/client";
import { LocaleBoundary } from "../lib/ui-locale";
import { m } from "../paraglide/messages";
import { getLocale } from "../paraglide/runtime";
import { getNavTreeFn } from "../server/nav-tree";
import { getSidebarStateFn } from "../server/sidebar-state";
import { useCommandPalette } from "../store/command-palette";
import { useActiveRegionNavTree } from "../store/corpus/region-nav-tree";
import { subscribeAuth } from "../store/userland/userland-store";

export const Route = createRootRoute({
	// Restore the persisted sidebar drawer state SSR-side so it never flashes
	// open before collapsing. The same cookie is read on both render passes —
	// server: the incoming Cookie header (getSidebarStateFn); client hydration +
	// later navigations: document.cookie — so the `defaultOpen` value matches and
	// React sees no hydration mismatch. Absent/invalid cookie → open. Carried in
	// route context (not loader data) to stay additive for the nav-tree loader's
	// other consumers. On the client this reads document.cookie directly, so it
	// never becomes a per-navigation RPC.
	beforeLoad: async (): Promise<{ sidebarOpen: boolean }> => ({
		sidebarOpen:
			typeof document === "undefined"
				? await getSidebarStateFn()
				: parseSidebarState(
						readCookieValue(document.cookie, SIDEBAR_COOKIE_NAME),
					),
	}),
	loader: () => getNavTreeFn(),
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: m.root_meta_title() },
			{ name: "theme-color", content: "#0d0a16" },
			{ name: "apple-mobile-web-app-capable", content: "yes" },
			{
				name: "apple-mobile-web-app-status-bar-style",
				content: "black-translucent",
			},
			{
				property: "og:title",
				content: m.root_meta_title(),
			},
			{
				property: "og:description",
				content: m.root_meta_description(),
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
	if (parts.length === 0) return [m.command_palette_nav_browse()];

	if (parts[0] === "vault") {
		const sub = parts[1];
		if (sub === "sets") return [m.bottom_nav_vault(), m.sidebar_vault_sets()];
		if (sub === "binders")
			return [m.bottom_nav_vault(), m.command_palette_nav_binders()];
		if (sub)
			return [m.bottom_nav_vault(), sub.charAt(0).toUpperCase() + sub.slice(1)];
		return [m.bottom_nav_vault()];
	}
	if (parts[0] === "search") return [m.nav_search()];
	// /pokemon/{name} — species page (not in the series/set nav tree).
	if (parts[0] === "pokemon" && parts[1]) {
		return [
			m.command_palette_nav_browse(),
			m.home_supertype_pokemon(),
			titleCaseSlug(parts[1]),
		];
	}

	// /{series}/{set}/{card?}
	const seriesSlug = parts[0];
	const setSlug = parts[1];
	const cardSlug = parts[2];

	const series = tree.find((s) => s.slug === seriesSlug);
	const set = series?.sets.find((s) => s.slug === setSlug);

	// Unknown single segment (e.g. /profile) → just the capitalised label.
	if (!series && parts.length === 1) return [capitalize(seriesSlug)];

	const crumbs: string[] = [m.command_palette_nav_browse()];
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
	const openPalette = useCommandPalette((s) => s.setOpen);

	return (
		<header className="sticky top-0 z-30 flex h-14 items-center gap-2 justify-between border-b border-(--hairline) px-4 backdrop-blur-md">
			<SidebarTrigger />

			{/* Breadcrumb */}
			<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
				{crumbItems.map((item) => (
					<span key={item.key} className="flex items-center gap-1.5 min-w-0">
						{!item.isFirst && (
							<span className="font-mono text-(--faint) text-xs opacity-60 shrink-0">
								›
							</span>
						)}
						<span
							className={
								item.isLast
									? "truncate text-sm font-semibold text-(--ink)"
									: "truncate text-sm text-(--faint) hidden sm:block"
							}
						>
							{item.label}
						</span>
					</span>
				))}
			</div>

			{/* Search / command palette (⌘K) — md:+ only; on mobile the bottom nav
			    carries the Search slot, so this duplicate header button is hidden. */}
			<Button
				variant="ghost"
				size="icon"
				className="hidden md:inline-flex"
				aria-label={m.root_search_and_commands_aria()}
				title={m.root_search_shortcut_title()}
				onClick={() => openPalette(true)}
			>
				<Search />
			</Button>
			{/* Catalog language — mobile only; the sidebar footer control (off-canvas
			    on phones) covers md:+. */}
			<span className="md:hidden">
				<HeaderLanguageControl />
			</span>
			<RepoLink />
			<AboutDialog />
		</header>
	);
}

function RootComponent() {
	// The root loader tree is region-blind (west); follow the active region so a
	// client-side language switch reshapes the sidebar/header/browse tree.
	const tree = useActiveRegionNavTree(Route.useLoaderData());
	// Persisted drawer state, resolved from the cookie in beforeLoad (SSR-safe).
	const { sidebarOpen } = Route.useRouteContext();

	// Wire Supabase auth listener once at app mount (client-side only).
	// No-ops when cloud is disabled (no env vars set).
	useEffect(() => {
		if (!isCloudEnabled()) return;
		void subscribeAuth();
	}, []);

	// Browse-cache Service Worker (always on; caches viewed card images).
	useEffect(() => {
		void (async () => {
			const { registerBrowseCacheSW } = await import(
				"../store/offline-images/browse-cache"
			);
			const { loadThumbCap } = await import(
				"../store/offline-images/images-runtime"
			);
			await registerBrowseCacheSW();
			await loadThumbCap();
		})();
	}, []);

	return (
		<RootDocument>
			<LocaleBoundary>
				<SidebarProvider defaultOpen={sidebarOpen}>
					<AppSidebar tree={tree} />
					<SidebarInset>
						<ShellHeader tree={tree} />
						{/* Bottom padding on mobile clears the fixed bottom nav (its footprint
						    + the iOS home indicator); removed at md:+ where the bar is hidden. */}
						<main className="flex-1 min-w-0 overflow-auto pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:pb-0">
							<Outlet />
						</main>
					</SidebarInset>
					<BottomNav />
				</SidebarProvider>
				<ClientOnly fallback={null}>
					<CommandPalette tree={tree} />
					<CardOverlay />
					<VersionToast />
					<SyncToastsWatcher />
					<PreviewLogin />
					<Toaster />
				</ClientOnly>
			</LocaleBoundary>
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang={bcp47(getLocale())} suppressHydrationWarning>
			<head>
				{/* Dev-only on-page error reporter for devtools-less devices (phones
				    on the LAN); prints UA + uncaught errors/rejections to a red box.
				    Disabled for now, kept for the next devtools-less debugging round.
				    Re-enable by restoring the block below inside the head:
				{import.meta.env.DEV && (
					<script
						// Inline + first so it catches module parse/load failures that
						// kill hydration before React runs.
						// dev-only static string, no user input
						dangerouslySetInnerHTML={{
							__html: `(function(){function show(m){var d=document.getElementById('__dev_err');if(!d){d=document.createElement('pre');d.id='__dev_err';d.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#7f1d1d;color:#fff;font:11px/1.4 monospace;padding:8px;margin:0;max-height:40vh;overflow:auto;white-space:pre-wrap';document.documentElement.appendChild(d);}d.textContent+=m+'\\n\\n';}show('UA: '+navigator.userAgent);window.addEventListener('error',function(e){show((e.message||'error')+' @ '+(e.filename||'?')+':'+(e.lineno||'?'))},true);window.addEventListener('unhandledrejection',function(e){show('unhandledrejection: '+(e.reason&&(e.reason.stack||e.reason.message)||e.reason))});})();`,
						}}
					/>
				)}
				*/}
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

import {
	ClientOnly,
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, useEffect } from "react";
import { PreviewLogin } from "@/components/dev/preview-login";
import { AboutDialog } from "@/components/shell/about-dialog";
import { CommandPalette } from "@/components/shell/command-palette";
import { OnlineIndicator } from "@/components/shell/online-indicator";
import { RepoLink } from "@/components/shell/repo-link";
import { SyncToastsWatcher } from "@/components/sync/sync-toasts";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { LIST_SEARCH_DEFAULTS } from "../lib/list-search";
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
			{ rel: "manifest", href: "/manifest.webmanifest" },
		],
	}),
	component: RootComponent,
});

/**
 * Derive breadcrumb segments — each a `{ label, linkProps }` pair — from the
 * current pathname + nav tree. `linkProps` is a TanStack link target (built with
 * per-crumb `as const` literals so `to`/`params`/`search` inference survives, the
 * set-tile pattern) or `null` for a crumb with no standalone route (e.g. the
 * "Pokémon" supertype middle crumb). The consumer renders navigable crumbs as
 * real <Link>s and terminal/null crumbs as a non-clickable page label.
 */
function useBreadcrumb(tree: NavTree) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length === 0)
		return [
			{
				label: m.command_palette_nav_browse(),
				linkProps: { to: "/" } as const,
			},
		];

	if (parts[0] === "vault") {
		const sub = parts[1];
		const vaultCrumb = {
			label: m.bottom_nav_vault(),
			linkProps: { to: "/vault" } as const,
		};
		if (sub === "sets")
			return [
				vaultCrumb,
				{
					label: m.sidebar_vault_sets(),
					linkProps: { to: "/vault/sets" } as const,
				},
			];
		if (sub === "binders")
			return [
				vaultCrumb,
				{
					label: m.command_palette_nav_binders(),
					linkProps: { to: "/vault/binders" } as const,
				},
			];
		if (sub)
			return [
				vaultCrumb,
				{
					label: sub.charAt(0).toUpperCase() + sub.slice(1),
					linkProps: null,
				},
			];
		return [vaultCrumb];
	}
	if (parts[0] === "search")
		return [
			{
				label: m.nav_search(),
				linkProps: {
					to: "/search",
					search: { ...LIST_SEARCH_DEFAULTS },
				} as const,
			},
		];
	// /pokemon/{name} — species page (not in the series/set nav tree). The
	// "Pokémon" supertype crumb has no standalone route → linkProps null.
	if (parts[0] === "pokemon" && parts[1]) {
		return [
			{
				label: m.command_palette_nav_browse(),
				linkProps: { to: "/" } as const,
			},
			{ label: m.home_supertype_pokemon(), linkProps: null },
			{
				label: titleCaseSlug(parts[1]),
				linkProps: {
					to: "/pokemon/$name",
					params: { name: parts[1] },
					search: LIST_SEARCH_DEFAULTS,
				} as const,
			},
		];
	}

	// /{series}/{set}/{card?}
	const seriesSlug = parts[0];
	const setSlug = parts[1];
	const cardSlug = parts[2];

	const series = tree.find((s) => s.slug === seriesSlug);
	const set = series?.sets.find((s) => s.slug === setSlug);

	// Unknown single segment (e.g. /profile) → just the capitalised label, no link.
	if (!series && parts.length === 1)
		return [{ label: capitalize(seriesSlug), linkProps: null }];

	return [
		{
			label: m.command_palette_nav_browse(),
			linkProps: { to: "/" } as const,
		},
		// The /$series index validates only `{ lang }` (not the full list-search),
		// so its crumb link carries no search — matching every other /$series link.
		...(series
			? [
					{
						label: series.name,
						linkProps: {
							to: "/$series",
							params: { series: seriesSlug },
						} as const,
					},
				]
			: []),
		...(set
			? [
					{
						label: set.name,
						linkProps: {
							to: "/$series/$set",
							params: { series: seriesSlug, set: setSlug },
							search: LIST_SEARCH_DEFAULTS,
						} as const,
					},
				]
			: []),
		// Terminal card crumb links to the REAL card page (not the overlay).
		...(cardSlug && cardSlug !== "manage"
			? [
					{
						label: cardSlug.toUpperCase(),
						linkProps: {
							to: "/$series/$set/$card",
							params: { series: seriesSlug, set: setSlug, card: cardSlug },
						} as const,
					},
				]
			: []),
	];
}

function ShellHeader({ tree }: { tree: NavTree }) {
	const crumbs = useBreadcrumb(tree);
	// Pair each crumb with a cumulative-path key so duplicate labels (e.g. a base
	// set sharing its series name) stay distinct without an array-index key.
	const crumbItems = crumbs.map((crumb, i) => ({
		...crumb,
		key: crumbs
			.slice(0, i + 1)
			.map((c) => c.label)
			.join(" / "),
		isFirst: i === 0,
		isLast: i === crumbs.length - 1,
	}));
	const openPalette = useCommandPalette((s) => s.setOpen);

	return (
		<header className="sticky top-0 z-30 flex h-14 items-center gap-2 justify-between border-b border-(--hairline) px-4 backdrop-blur-md">
			<SidebarTrigger />

			{/* Breadcrumb — shadcn primitives, each navigable crumb a real <Link>.
			    Non-terminal crumbs collapse on mobile (hidden sm:inline-flex) so only
			    the current page shows; the "›" separators stay to hint at depth. */}
			<Breadcrumb className="flex min-w-0 flex-1 items-center overflow-hidden">
				<BreadcrumbList className="flex-nowrap gap-1.5 overflow-hidden sm:gap-1.5">
					{crumbItems.map((item) => (
						<Fragment key={item.key}>
							{!item.isFirst && (
								<BreadcrumbSeparator className="font-mono text-(--faint) text-xs opacity-60 shrink-0">
									›
								</BreadcrumbSeparator>
							)}
							{item.isLast || item.linkProps === null ? (
								<BreadcrumbItem
									className={item.isLast ? undefined : "hidden sm:inline-flex"}
								>
									<BreadcrumbPage
										className={
											item.isLast
												? "truncate text-sm font-semibold text-(--ink)"
												: "truncate text-sm font-normal text-(--faint)"
										}
									>
										{item.label}
									</BreadcrumbPage>
								</BreadcrumbItem>
							) : (
								<BreadcrumbItem className="hidden sm:inline-flex">
									<BreadcrumbLink
										asChild
										className="truncate text-sm text-(--faint) hover:text-(--ink)"
									>
										<Link {...item.linkProps}>{item.label}</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
							)}
						</Fragment>
					))}
				</BreadcrumbList>
			</Breadcrumb>

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
					<OnlineIndicator />
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

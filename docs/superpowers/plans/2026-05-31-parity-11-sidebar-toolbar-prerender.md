# Parity Plan 11 — Sidebar Collapse + Toolbar + Prerender Sets

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore collapsible series in the sidebar, the mobile sidebar sheet (hamburger), the About/credits dialog and GitHub repo link in the toolbar, and prerender the set pages. Fixes the lost-collapse and lost-mobile-nav regressions and your "prerender each set page" request.

**Architecture:** The sidebar stays SSR (all-expanded, crawlable) as the `ClientOnly` fallback; a `SidebarNavInteractive` island with `ui/collapsible` replaces it client-side, default-collapsing non-active series. The toolbar restores `AboutDialog` + `RepoLink` (ported from `main`) and gains a mobile `Sheet` that renders the same SSR `SidebarNav`. Prerender widens to 2-segment set paths.

**Tech Stack:** `ui/collapsible`, `ui/sheet`, `ui/dialog`, `ui/button` (all on branch), `@tanstack/react-router` `Link`/`ClientOnly`, the existing `NavTree`, Bun test.

---

## Context the implementer needs

- **Root layout** (`src/routes/__root.tsx`) renders `<AppToolbar/>` + a `hidden lg:block` `<aside>` with `<SidebarNav tree activeSeriesSlug activeSetSlug/>`. Mobile (`<lg`) currently has NO nav.
- **`SidebarNav`** (`components/shell/sidebar-nav.tsx`) is SSR-safe, all-expanded, props `{tree, activeSeriesSlug, activeSetSlug}`. Keep it as the crawlable baseline.
- **`NavTree`/`NavSeries`/`NavSet`** (`server/nav-tree.ts`): `NavSeries = {name, slug, year, sets: NavSet[]}`, `NavSet = {id, name, slug, logo, symbol, total}`.
- **`AppToolbar`** (`components/shell/app-toolbar.tsx`) currently has brand + Collection link only.
- **Restore from `main`:** `about-dialog.tsx` + `repo-link.tsx` (only the `@/components/ui/*` imports — no `react-router`; clean ports). The Open-Packs button is added in **Plan 12** (needs the pack dialog); not here.
- **`ui/collapsible`** = Radix `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent`. **`ui/sheet`** = Radix dialog-based side panel (`Sheet`/`SheetTrigger`/`SheetContent`/`SheetTitle`).
- **`vite.config.ts`** prerender filter is `segments.length <= 1`; widen to `<= 2` to include `/{series}/{set}`. `failOnError` is `true` (keep — fails loud).
- bun test + happy-dom; `renderInRouter` helper (await `router.load()`).

---

## File structure

- `src/components/shell/about-dialog.tsx` — restore from `main`.
- `src/components/shell/repo-link.tsx` — restore from `main`.
- `src/components/islands/sidebar-collapsible.tsx` — interactive collapsible sidebar island.
- `src/components/shell/sidebar-nav.tsx` — modify: extract a shared `SidebarRows` the island reuses (DRY), or keep as-is and have the island render its own rows. (Plan: island renders its own rows; `SidebarNav` stays the SSR fallback.)
- `src/components/shell/app-toolbar.tsx` — modify: add mobile `Sheet` + `AboutDialog` + `RepoLink`.
- `src/routes/__root.tsx` — modify: sidebar `<aside>` renders the collapsible island (ClientOnly) over the SSR `SidebarNav` fallback.
- `vite.config.ts` — modify: prerender filter `<= 2`.

---

### Task 1: Restore About dialog + repo link

**Files:**
- Create: `src/components/shell/about-dialog.tsx` (from `main`)
- Create: `src/components/shell/repo-link.tsx` (from `main`)

- [ ] **Step 1: Restore both from `main`** (their imports are `@/components/ui/*` only — no repoint needed).

```bash
git show main:src/components/app-shell/about-dialog.tsx > src/components/shell/about-dialog.tsx
git show main:src/components/app-shell/repo-link.tsx > src/components/shell/repo-link.tsx
```

- [ ] **Step 2: Typecheck** — `bun run typecheck` → 0. (`ui/dialog`, `ui/button` exist; the icons are inlined SVGs, no lucide brand deps.)

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/about-dialog.tsx src/components/shell/repo-link.tsx
git commit -m "feat(shell): restore About/credits dialog + GitHub repo link"
```

---

### Task 2: Collapsible sidebar island

**Files:**
- Create: `src/components/islands/sidebar-collapsible.tsx`
- Test: `src/components/islands/sidebar-collapsible.test.tsx`

- [ ] **Step 1: Write a render test** — proves it lists series + sets and starts with the active series open.

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { SidebarCollapsible } from "./sidebar-collapsible";
import type { NavTree } from "../../server/nav-tree";

const tree: NavTree = [
	{ name: "Sword & Shield", slug: "sword-shield", year: 2020, sets: [
		{ id: "swsh9", name: "Brilliant Stars", slug: "brilliant-stars", logo: "l", symbol: "y", total: 172 },
	]},
	{ name: "Base", slug: "base", year: 1999, sets: [
		{ id: "base1", name: "Base", slug: "base", logo: "l", symbol: "y", total: 102 },
	]},
];

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

test("SidebarCollapsible lists every series; active series' set is visible", async () => {
	await renderInRouter(
		<SidebarCollapsible tree={tree} activeSeriesSlug="sword-shield" activeSetSlug="brilliant-stars" />,
	);
	expect(screen.getByText("Sword & Shield")).toBeDefined();
	expect(screen.getByText("Base")).toBeDefined();
	// active series open → its set link is rendered
	expect(screen.getByText("Brilliant Stars")).toBeDefined();
});
```

- [ ] **Step 2: Run, verify FAIL** — `bun test src/components/islands/sidebar-collapsible.test.tsx`

- [ ] **Step 3: Implement `src/components/islands/sidebar-collapsible.tsx`.** Each series is a `Collapsible`; default-open only the active series.

```tsx
import { Link } from "@tanstack/react-router";
import { ChevronRight, Layers } from "lucide-react";
import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { NavSeries, NavTree } from "../../server/nav-tree";

interface SidebarCollapsibleProps {
	tree: NavTree;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
	onNavigate?: () => void;
}

function SeriesRow({
	series,
	activeSeriesSlug,
	activeSetSlug,
	onNavigate,
}: {
	series: NavSeries;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
	onNavigate?: () => void;
}) {
	const [open, setOpen] = useState(series.slug === activeSeriesSlug);
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger
				className={cn(
					"flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-secondary",
					series.slug === activeSeriesSlug ? "text-primary" : "text-foreground",
				)}
			>
				<ChevronRight className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")} />
				<span className="flex-1 truncate">{series.name}</span>
				<span className="text-xs tabular-nums text-muted-foreground">{series.year}</span>
				<span className="text-xs text-muted-foreground">{series.sets.length}</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="ml-4 border-l border-border pl-3">
				{series.sets.map((set) => (
					<Link
						key={set.id}
						to="/$series/$set"
						params={{ series: series.slug, set: set.slug }}
						search={LIST_SEARCH_DEFAULTS}
						onClick={() => onNavigate?.()}
						aria-current={set.slug === activeSetSlug ? "page" : undefined}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary hover:text-foreground",
							set.slug === activeSetSlug ? "bg-primary text-primary-foreground" : "text-muted-foreground",
						)}
					>
						<img src={set.symbol} alt="" className="max-h-5 max-w-5 object-contain" />
						<span className="flex-1 truncate">{set.name}</span>
						<span className="text-xs opacity-70">{set.total}</span>
					</Link>
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}

export function SidebarCollapsible({ tree, activeSeriesSlug, activeSetSlug, onNavigate }: SidebarCollapsibleProps) {
	return (
		<nav className="flex flex-col gap-0.5 p-3">
			<Link to="/" onClick={() => onNavigate?.()} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary">
				Home
			</Link>
			<div className="mt-2 flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				<Layers className="size-4" />
				Series &amp; Sets
			</div>
			{tree.map((series) => (
				<SeriesRow
					key={series.slug}
					series={series}
					activeSeriesSlug={activeSeriesSlug}
					activeSetSlug={activeSetSlug}
					onNavigate={onNavigate}
				/>
			))}
		</nav>
	);
}
```
Note: `search={LIST_SEARCH_DEFAULTS}` is required on `/$series/$set` links (Plan 09 validateSearch); `stripSearchParams` keeps the URL clean. `Collapsible` from `ui/collapsible`.

- [ ] **Step 4: Run, verify PASS** — `bun test src/components/islands/sidebar-collapsible.test.tsx`. If Radix `Collapsible` hides content when closed (so non-active series' sets aren't in the DOM), the test only asserts the ACTIVE series' set is visible (it does) — fine.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/sidebar-collapsible.tsx src/components/islands/sidebar-collapsible.test.tsx
git commit -m "feat(shell): collapsible sidebar island (default-open active series)"
```

---

### Task 3: Mount the collapsible island in the layout (desktop) + mobile sheet

**Files:**
- Modify: `src/routes/__root.tsx`
- Modify: `src/components/shell/app-toolbar.tsx`

- [ ] **Step 1: Desktop — render the island over the SSR fallback.** In `__root.tsx`, wrap the sidebar content: SSR renders `SidebarNav` (all-expanded, crawlable); client swaps to `SidebarCollapsible`.

Replace the `<aside>` body:
```tsx
// import:
import { ClientOnly } from "@tanstack/react-router";
import { SidebarCollapsible } from "../components/islands/sidebar-collapsible";

// in the aside:
					<aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-sidebar lg:block">
						<ClientOnly
							fallback={
								<SidebarNav tree={tree} activeSeriesSlug={activeSeriesSlug} activeSetSlug={activeSetSlug} />
							}
						>
							<SidebarCollapsible tree={tree} activeSeriesSlug={activeSeriesSlug} activeSetSlug={activeSetSlug} />
						</ClientOnly>
					</aside>
```

- [ ] **Step 2: Mobile sheet in the toolbar.** Rewrite `app-toolbar.tsx` to add a hamburger `Sheet` (mobile only) + About + repo link. The sheet needs the nav tree — pass it from the layout, OR have the toolbar read it via `getNavTreeFn`'s loader data. Simplest: the toolbar takes `tree` + active slugs as props from `__root.tsx`.

`app-toolbar.tsx`:
```tsx
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavTree } from "../../server/nav-tree";
import { SidebarCollapsible } from "../islands/sidebar-collapsible";
import { AboutDialog } from "./about-dialog";
import { RepoLink } from "./repo-link";

interface AppToolbarProps {
	tree: NavTree;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
}

export function AppToolbar({ tree, activeSeriesSlug, activeSetSlug }: AppToolbarProps) {
	const [open, setOpen] = useState(false);
	return (
		<header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
			<div className="flex min-w-0 items-center gap-3">
				<Sheet open={open} onOpenChange={setOpen}>
					<SheetTrigger asChild>
						<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
							<Menu className="size-5" />
						</Button>
					</SheetTrigger>
					<SheetContent side="left" className="w-72 overflow-y-auto p-0">
						<SheetTitle className="sr-only">Series &amp; sets</SheetTitle>
						<SidebarCollapsible
							tree={tree}
							activeSeriesSlug={activeSeriesSlug}
							activeSetSlug={activeSetSlug}
							onNavigate={() => setOpen(false)}
						/>
					</SheetContent>
				</Sheet>
				<Link to="/" aria-label="Pokémon TCG Holo Playground — home" className="flex shrink-0 items-center gap-2">
					<img src="/logo-64.png" alt="" className="size-8 shrink-0" />
					<span className="hidden text-lg font-bold sm:block">Pokémon TCG Holo Playground</span>
				</Link>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Button variant="outline" asChild>
					<Link to="/collection">Collection</Link>
				</Button>
				<AboutDialog />
				<RepoLink />
			</div>
		</header>
	);
}
```

- [ ] **Step 3: Pass props from `__root.tsx`.** Update the `<AppToolbar/>` call:
```tsx
				<AppToolbar tree={tree} activeSeriesSlug={activeSeriesSlug} activeSetSlug={activeSetSlug} />
```
The `Sheet` is client-interactive but renders fine on the server collapsed (Radix dialog is closed by default; SSR-safe). The mobile nav links are inside the sheet (not in the SSR-crawlable flow, but the desktop `<aside>` SSRs the full `SidebarNav` for crawlers — so all set links remain in the SSR HTML).

- [ ] **Step 4: Build + SSR-verify** — sidebar links still crawlable (desktop aside SSRs `SidebarNav`); toolbar renders.

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/ > /tmp/p11home.html
kill $SERVER_PID
node -e 'const h=require("fs").readFileSync("/tmp/p11home.html","utf8"); console.log("series links in SSR:", (h.match(/\/sword-shield/g)||[]).length>0); console.log("About btn:", h.includes("About") || h.includes("about")); '
```
Expected: series links present (SSR sidebar), toolbar present. Report.

- [ ] **Step 5: Commit**

```bash
git add src/routes/__root.tsx src/components/shell/app-toolbar.tsx
git commit -m "feat(shell): collapsible desktop sidebar + mobile sheet + about/repo in toolbar"
```

---

### Task 4: Prerender set pages

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Widen the prerender filter to include set paths.** Change the filter from `<= 1` to `<= 2` (home + series + sets; cards stay SSR-on-demand).

```ts
				filter: ({ path }) => {
					const segments = path.split("/").filter(Boolean);
					// Prerender home (0), series (1), and set (2) pages. Card pages (3)
					// stay SSR-on-demand. Search/collection are excluded below.
					if (segments[0] === "search" || segments[0] === "collection" || segments[0] === "pokemon") return false;
					return segments.length <= 2;
				},
```
Note: explicitly exclude `search`/`collection`/`pokemon` (they're param/user pages, not catalog). `crawlLinks` discovers set paths from the prerendered series pages' set-tile links.

- [ ] **Step 2: Build + confirm set pages prerendered.**

```bash
bun run build 2>&1 | tail -5
echo "total html: $(find .output -name '*.html' | wc -l | tr -d ' ')"
echo "set html sample:"; find .output -name '*.html' | grep -E '/[a-z-]+/[a-z0-9-]+/index.html' | head -5
```
Expected: build exits 0 (failOnError:true — fails if a set page errors); total HTML jumps from ~20 to ~180 (home + ~18 series + ~165 sets); set HTML files present. Report the total + 3 set samples. **If the build fails** because a set page errors during prerender, that's a real bug surfaced by failOnError — report the exact error (do NOT revert to failOnError:false to hide it).

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "build(prerender): prerender set pages (home + series + sets static)"
```

---

### Task 5: Verification gate

- [ ] **Step 1: Full gate (parallel):** `bun run typecheck` (0), `biome check --config-path=. src` (clean), `bun test` (all pass: prior + sidebar-collapsible), `bun run build` (0, ~180 prerendered pages).
- [ ] **Step 2: Per-route SSR smoke** (6 routes 200; series sidebar links in `/` HTML). Same loop as prior plans.
- [ ] **Step 3: Commit lint autofixes** if any (`git add -u src/`).

---

## Self-review

- **Spec coverage:** Group 3 + config — collapsible series (#1, island over SSR fallback), mobile sheet (#13, hamburger → same nav), About dialog + repo link (#13, restored), prerender sets (#8, filter `<= 2`).
- **Placeholders:** none.
- **Type consistency:** `SidebarCollapsible` props match `SidebarNav` (`tree`/`activeSeriesSlug`/`activeSetSlug`) + `onNavigate`. `AppToolbar` now takes `tree`+slugs (root passes them). `NavTree`/`NavSeries`/`NavSet` from `server/nav-tree`. `LIST_SEARCH_DEFAULTS` for `/$series/$set` links (Plan 09).
- **Hydration:** desktop sidebar = SSR `SidebarNav` fallback (crawlable, all-expanded) → `SidebarCollapsible` island on client. Mobile sheet is client-only (closed on SSR; its links aren't the crawl path — the desktop aside SSR is). Toolbar renders server-side (Sheet closed, About/repo are static triggers).
- **Open-Packs button:** intentionally NOT here — added in Plan 12 with the pack dialog (noted, not dropped).
- **Risk:** widening prerender to sets means ~165 build-time renders, each fetching its full card list. `failOnError:true` will fail the build if any set's loader errors — surfacing real issues instead of shipping gaps. The crawl discovers set paths via the series pages' set-tile links (`crawlLinks:true`).

## Carried forward

- Plan 12 — pack opening (+ the Open-Packs toolbar button).
- Plan 13 — timeline / view-mode.
- Tilt-to-shine button (deferred from Plan 10).

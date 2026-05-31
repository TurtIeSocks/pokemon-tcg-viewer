# TanStack Start Migration — Plan 03: Navigational Spine + Set Browsing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crawlable `/` → `/{series}` → `/{series}/{set}` path tree, server-rendered: sidebar nav from real data, booster-pack set tiles per series, and a set page that SSRs every card (name + image, in HTML) with per-set filter facets. Series pages prerender; set pages are SSR + SWR.

**Architecture:** A memoized server-side slug index (built from the sets list via Plan 02's `buildSlugIndex`) backs a single `getNavTreeFn` server function that returns a **plain serializable nav tree** (series → sets, each with precomputed slug + id). Loaders use this tree for both link-building and slug→id resolution (array lookup — no `Map` crosses the JSON boundary). New SSR-safe shell components (props-driven, TanStack `Link`) replace the SPA sidebar/toolbar for the route tree; the old components stay on disk for the still-living legacy SPA until Plan 05. Interactivity (collapsible animation, virtual grid, holo) is deferred to Plan 05 islands — Plan 03 ships static, crawlable HTML.

**Tech Stack:** TanStack Start `createServerFn` + `createFileRoute` loaders + `head()` meta + `setResponseHeaders`; Plan 02's `slugify`/`buildSlugIndex`/`getCardsBySetFn`/`cacheControl`; Bun test.

---

## Assumptions (delegate-mode decisions — review)

1. **Serializable nav tree, not a `Map` index, crosses to the client.** `getNavTreeFn` builds `buildSlugIndex(sets, [])` server-side, then derives a plain `NavTree` (arrays + string slugs/ids). Resolution (`seriesSlug`+`setSlug` → `setId`) is an array `.find()` on this tree. Rationale: `Map` isn't JSON-serializable; ~165 sets make linear lookup trivial; keeps one data source for links + resolution.
2. **Card slugs are NOT built here.** They need the corpus (Plan 04). So the set page SSRs card **name + image** (the crawlable SEO payload) but does NOT yet link each card to its own page — `/{series}/{set}/{card}` routes + per-card links land in Plan 04. No dead links shipped.
3. **Per-set facets computed from the whole set, server-side.** The set loader fetches all cards in the set (page size 250, looping if `totalCount > 250` — real sets cap ~400) and derives distinct `supertypes/subtypes/rarities/types` from them. This is the "only show filters that apply" behavior; it also gives the full card list to SSR.
4. **New shell components** live in `src/components/shell/` (`sidebar-nav.tsx`, `app-toolbar.tsx`), props-driven, TanStack `Link`, SSR-safe (no `useSets`, no `import.meta.env.BASE_URL`). The legacy `series-sidebar/` + `app-shell/toolbar.tsx` are untouched (still used by the legacy SPA pages) and removed in Plan 05.
5. **Booster-pack tiles navigate, not rip.** On `/{series}`, each set tile is a TanStack `Link` to the set page (reusing `booster-pack.css` visuals via a static, non-interactive markup). The rip-to-open animation stays with the separate pack feature (later). 
6. **Prerender = series pages only**, via `crawlLinks: true` + a `filter` allowing `/` and single-segment `/{series}` paths, rejecting deeper. **Build-time prerender requires the data source reachable at build** (`process.env.API_BASE` → the CF Worker). If unset, `getSetsFn` falls back to the public origin. Noted as a deploy/CI requirement.

---

## File structure

- `src/server/nav-tree.ts` — `NavTree`/`NavSeries`/`NavSet` types + pure `deriveNavTree(sets)` (uses `buildSlugIndex`) + memoized `getNavTreeFn` (`createServerFn`). Resolution helpers `findSeries`/`findSet` (pure, array lookup). Sibling test for the pure parts.
- `src/server/set-facets.ts` — pure `deriveFacets(cards)` → distinct sorted dimension values. Sibling test.
- `src/components/shell/sidebar-nav.tsx` — SSR-safe sidebar (props: `NavTree`, active slugs). TanStack `Link`.
- `src/components/shell/app-toolbar.tsx` — SSR-safe toolbar (logo, Collection link). TanStack `Link`.
- `src/routes/__root.tsx` — **modify**: add nav-tree loader, render toolbar + sidebar + `<Outlet/>`.
- `src/routes/$series/index.tsx` — series page: booster-pack set tiles.
- `src/routes/$series/$set/index.tsx` — set page: SSR card grid + facets + SWR headers.
- `src/components/shell/set-tile.tsx` — static booster-pack-styled `Link` tile (Assumption 5).
- `vite.config.ts` — **modify**: add `prerender` config.

---

### Task 1: Nav tree — derive + resolve (pure) + server fn

**Files:**
- Create: `src/server/nav-tree.ts`
- Test: `src/server/nav-tree.test.ts`

- [ ] **Step 1: Write the failing tests** (pure parts only — server fn is the network boundary)

```ts
import { describe, expect, test } from "bun:test";
import { deriveNavTree, findSeries, findSet } from "./nav-tree";
import type { PokemonSet } from "./card-mappers";

const sets: PokemonSet[] = [
	{ id: "swsh9", name: "Brilliant Stars", series: "Sword & Shield", releaseDate: "2022/02/25", total: 172, images: { symbol: "sym1", logo: "logo1" } },
	{ id: "swsh1", name: "Sword & Shield", series: "Sword & Shield", releaseDate: "2020/02/07", total: 202, images: { symbol: "sym2", logo: "logo2" } },
	{ id: "base1", name: "Base", series: "Base", releaseDate: "1999/01/09", total: 102, images: { symbol: "sym3", logo: "logo3" } },
];

describe("deriveNavTree", () => {
	const tree = deriveNavTree(sets);

	test("groups sets under their series with slugs", () => {
		const ss = findSeries(tree, "sword-shield");
		expect(ss?.name).toBe("Sword & Shield");
		expect(ss?.sets.map((s) => s.slug).sort()).toEqual(
			["brilliant-stars", "sword-shield"].sort(),
		);
	});

	test("resolves a (seriesSlug, setSlug) pair to the set id", () => {
		expect(findSet(tree, "sword-shield", "brilliant-stars")?.id).toBe("swsh9");
		expect(findSet(tree, "base", "base")?.id).toBe("base1");
	});

	test("carries logo/symbol/total through for rendering", () => {
		const set = findSet(tree, "sword-shield", "brilliant-stars");
		expect(set?.logo).toBe("logo1");
		expect(set?.total).toBe(172);
	});

	test("series carry earliest release year", () => {
		expect(findSeries(tree, "sword-shield")?.year).toBe(2020);
	});

	test("unknown slugs resolve to undefined", () => {
		expect(findSeries(tree, "nope")).toBeUndefined();
		expect(findSet(tree, "sword-shield", "nope")).toBeUndefined();
	});

	test("tree is plain-JSON serializable (no Maps)", () => {
		expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
	});
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/server/nav-tree.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement `src/server/nav-tree.ts`**

```ts
import { createServerFn } from "@tanstack/react-start";
import { buildSlugIndex, slugify } from "../lib/slug";
import { getSetsFn } from "./card-data";
import type { PokemonSet } from "./card-mappers";

export interface NavSet {
	id: string;
	name: string;
	slug: string;
	logo: string;
	symbol: string;
	total: number;
}
export interface NavSeries {
	name: string;
	slug: string;
	year: number;
	sets: NavSet[];
}
export type NavTree = NavSeries[];

/**
 * Build a plain, JSON-serializable nav tree from the sets list. Set slugs are
 * taken from the collision-safe slug index (Plan 02) so they match the router's
 * resolution. Series ordered first-seen; sets ordered as given. No Maps in the
 * output — safe to return from a server function and render on the client.
 */
export function deriveNavTree(sets: PokemonSet[]): NavTree {
	const idx = buildSlugIndex(
		sets.map((s) => ({ id: s.id, name: s.name, series: s.series })),
		[],
	);
	const bySlug = new Map<string, NavSeries>();
	const order: NavSeries[] = [];
	for (const set of sets) {
		const seriesSlug = slugify(set.series);
		let series = bySlug.get(seriesSlug);
		if (!series) {
			series = { name: set.series, slug: seriesSlug, year: Number(set.releaseDate.slice(0, 4)) || 9999, sets: [] };
			bySlug.set(seriesSlug, series);
			order.push(series);
		}
		const loc = idx.setSlugById.get(set.id);
		if (!loc) continue;
		series.sets.push({
			id: set.id,
			name: set.name,
			slug: loc.setSlug,
			logo: set.images.logo,
			symbol: set.images.symbol,
			total: set.total,
		});
		const yr = Number(set.releaseDate.slice(0, 4));
		if (Number.isFinite(yr) && yr < series.year) series.year = yr;
	}
	return order;
}

export function findSeries(tree: NavTree, seriesSlug: string): NavSeries | undefined {
	return tree.find((s) => s.slug === seriesSlug);
}
export function findSet(
	tree: NavTree,
	seriesSlug: string,
	setSlug: string,
): NavSet | undefined {
	return findSeries(tree, seriesSlug)?.sets.find((s) => s.slug === setSlug);
}

// Memoize across requests in one server process. The sets list changes monthly;
// a process restart (deploy) picks up new sets. Avoids rebuilding the index per request.
let cached: NavTree | null = null;
export const getNavTreeFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<NavTree> => {
		if (cached) return cached;
		const sets = await getSetsFn();
		cached = deriveNavTree(sets);
		return cached;
	},
);
```

- [ ] **Step 4: Run, verify PASS**

Run: `bun test src/server/nav-tree.test.ts`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/nav-tree.ts src/server/nav-tree.test.ts
git commit -m "feat(server): serializable nav tree + memoized getNavTreeFn"
```

---

### Task 2: Per-set facets (pure)

**Files:**
- Modify: `src/components/holo-card/types.ts` (add `types?` field)
- Modify: `src/server/card-mappers.ts` (map `types`)
- Modify: `src/server/card-data.ts` (request `types` in select)
- Create: `src/server/set-facets.ts`
- Test: `src/server/set-facets.test.ts`

**Context — why the type extension:** `HoloCardData` today carries no `types` (Energy Type) field — `apiCardToProps` never mapped it and the API `select` never requested it; today's "Energy Type" filter works only as a query clause. Per-set faceting needs the value ON each card. `types` is additive + optional, the corpus already stores it (`corpus-types.ts`), so this is backward-compatible.

- [ ] **Step 0a: Add `types?` to `HoloCardData`.** In `src/components/holo-card/types.ts`, add after the `subtypes?` line:
```ts
	types?: string[];
```

- [ ] **Step 0b: Map `types` in the server mapper.** In `src/server/card-mappers.ts`: add `types?: string[];` to the `PokemonApiCard` interface (near `subtypes?`), and add `types: card.types,` to the object returned by `apiCardToProps` (near `subtypes: card.subtypes,`).

- [ ] **Step 0c: Request `types` in the fetch select.** In `src/server/card-data.ts`, in `fetchCards`, add `types,` to the `select=` query string (insert after `supertype,`). Result fragment: `...rarity,subtypes,supertype,types,set,...`.

- [ ] **Step 0d: Typecheck the additive change is clean**

Run: `bun run typecheck`
Expected: exit 0 (optional field; nothing else breaks). If a test fixture elsewhere now mismatches, it won't — the field is optional.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { deriveFacets } from "./set-facets";
import type { HoloCardData } from "../components/holo-card";

const c = (over: Partial<HoloCardData>): HoloCardData => ({
	id: "x", imageUrl: "l", imageUrlSmall: "s", name: "n", supertype: "Pokémon",
	setId: "swsh9", setName: "BS", setSeries: "S&S", cardNumber: "1", ...over,
});

describe("deriveFacets", () => {
	test("returns distinct sorted values per dimension that actually occur", () => {
		const f = deriveFacets([
			c({ supertype: "Pokémon", rarity: "Rare", subtypes: ["Stage 2", "VSTAR"], types: ["Fire"] }),
			c({ supertype: "Trainer", rarity: "Uncommon", subtypes: ["Item"] }),
			c({ supertype: "Pokémon", rarity: "Rare", subtypes: ["VSTAR"], types: ["Water"] }),
		]);
		expect(f.supertypes).toEqual(["Pokémon", "Trainer"]);
		expect(f.rarities).toEqual(["Rare", "Uncommon"]);
		expect(f.subtypes).toEqual(["Item", "Stage 2", "VSTAR"]);
		expect(f.types).toEqual(["Fire", "Water"]);
	});

	test("omits dimensions with no values (empty arrays, not undefined)", () => {
		const f = deriveFacets([c({ supertype: "Pokémon" })]);
		expect(f.types).toEqual([]);
		expect(f.rarities).toEqual([]);
	});
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/server/set-facets.test.ts`
Expected: FAIL — `deriveFacets` missing.

- [ ] **Step 3: Implement `src/server/set-facets.ts`**

```ts
import type { HoloCardData } from "../components/holo-card";

export interface SetFacets {
	supertypes: string[];
	subtypes: string[];
	rarities: string[];
	types: string[];
}

const sortedDistinct = (vals: (string | undefined)[]): string[] =>
	[...new Set(vals.filter((v): v is string => !!v))].sort((a, b) =>
		a.localeCompare(b),
	);

/** Distinct, sorted filter options that actually occur in the given cards. */
export function deriveFacets(cards: HoloCardData[]): SetFacets {
	return {
		supertypes: sortedDistinct(cards.map((c) => c.supertype)),
		subtypes: sortedDistinct(cards.flatMap((c) => c.subtypes ?? [])),
		rarities: sortedDistinct(cards.map((c) => c.rarity)),
		types: sortedDistinct(cards.flatMap((c) => c.types ?? [])),
	};
}
```

Note: `HoloCardData.types` now exists (added in Step 0a), so `deriveFacets` reads `c.types` directly — no fallback needed.

- [ ] **Step 4: Run, verify PASS**

Run: `bun test src/server/set-facets.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit** (include the type/mapper extension from Steps 0a–0c)

```bash
git add src/components/holo-card/types.ts src/server/card-mappers.ts src/server/card-data.ts src/server/set-facets.ts src/server/set-facets.test.ts
git commit -m "feat(server): carry card types through seam + per-set facet derivation"
```

---

### Task 3: SSR-safe shell components (sidebar + toolbar)

**Files:**
- Create: `src/components/shell/sidebar-nav.tsx`
- Create: `src/components/shell/app-toolbar.tsx`
- Test: `src/components/shell/sidebar-nav.test.tsx`

- [ ] **Step 1: Write a render test for the sidebar**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { SidebarNav } from "./sidebar-nav";
import type { NavTree } from "../../server/nav-tree";

const tree: NavTree = [
	{ name: "Sword & Shield", slug: "sword-shield", year: 2020, sets: [
		{ id: "swsh9", name: "Brilliant Stars", slug: "brilliant-stars", logo: "l", symbol: "y", total: 172 },
	]},
];

// SidebarNav renders TanStack <Link>s; mount inside a minimal router so Link resolves.
function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	return render(<RouterProvider router={router} />);
}

test("SidebarNav lists series and their sets", () => {
	renderInRouter(<SidebarNav tree={tree} activeSeriesSlug={null} activeSetSlug={null} />);
	expect(screen.getByText("Sword & Shield")).toBeDefined();
	expect(screen.getByText("Brilliant Stars")).toBeDefined();
});
```

Note: if mounting `<Link>` in a bare router is awkward under `bun test`, simplify — assert on a presentational sub-part that takes the same props but renders plain `<a href>` for test, OR snapshot the rendered text via `renderToString`. The reviewer/implementer should pick whichever is stable under this repo's `bun test` + happy-dom setup; the REQUIREMENT is: a test proves SidebarNav renders every series name and set name from the tree.

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/components/shell/sidebar-nav.test.tsx`
Expected: FAIL — `SidebarNav` missing.

- [ ] **Step 3: Implement `src/components/shell/sidebar-nav.tsx`**

```tsx
import { Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavTree } from "../../server/nav-tree";

interface SidebarNavProps {
	tree: NavTree;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
}

/**
 * SSR-safe series/set navigation. Pure-presentational: takes the serializable
 * nav tree as props and renders TanStack <Link>s. No data fetching, no browser
 * APIs — safe to server-render. The collapsible-animation island is Plan 05;
 * here every series is expanded so all set links are in the crawlable HTML.
 */
export function SidebarNav({ tree, activeSeriesSlug, activeSetSlug }: SidebarNavProps) {
	return (
		<nav className="flex flex-col gap-0.5 p-3">
			<Link
				to="/"
				className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
			>
				Home
			</Link>
			<div className="mt-2 flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				<Layers className="size-4" />
				Series &amp; Sets
			</div>
			{tree.map((series) => (
				<div key={series.slug}>
					<Link
						to="/$series"
						params={{ series: series.slug }}
						className={cn(
							"flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-secondary",
							series.slug === activeSeriesSlug && "text-primary",
						)}
					>
						<span className="flex-1 truncate">{series.name}</span>
						<span className="text-xs tabular-nums text-muted-foreground">{series.year}</span>
						<span className="text-xs text-muted-foreground">{series.sets.length}</span>
					</Link>
					<div className="ml-4 border-l border-border pl-3">
						{series.sets.map((set) => (
							<Link
								key={set.id}
								to="/$series/$set"
								params={{ series: series.slug, set: set.slug }}
								aria-current={set.slug === activeSetSlug ? "page" : undefined}
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary hover:text-foreground",
									set.slug === activeSetSlug
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground",
								)}
							>
								<img src={set.symbol} alt="" className="max-h-5 max-w-5 object-contain" />
								<span className="flex-1 truncate">{set.name}</span>
								<span className="text-xs opacity-70">{set.total}</span>
							</Link>
						))}
					</div>
				</div>
			))}
		</nav>
	);
}
```

- [ ] **Step 4: Implement `src/components/shell/app-toolbar.tsx`**

```tsx
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** SSR-safe top toolbar: brand + Collection link. No browser APIs. */
export function AppToolbar() {
	return (
		<header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
			<Link to="/" aria-label="Pokémon TCG Holo Playground — home" className="flex shrink-0 items-center gap-2">
				<img src="/logo-64.png" alt="" className="size-8 shrink-0" />
				<span className="hidden text-lg font-bold sm:block">Pokémon TCG Holo Playground</span>
			</Link>
			<div className="flex shrink-0 items-center gap-2">
				<Button variant="outline" asChild>
					<Link to="/collection">Collection</Link>
				</Button>
			</div>
		</header>
	);
}
```

Note: `/logo-64.png` is served from `public/` at the domain root (no `BASE_URL` prefix now). Confirm `public/logo-64.png` exists (it does per the repo tree).

- [ ] **Step 5: Run the sidebar test, verify PASS**

Run: `bun test src/components/shell/sidebar-nav.test.tsx`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/sidebar-nav.tsx src/components/shell/app-toolbar.tsx src/components/shell/sidebar-nav.test.tsx
git commit -m "feat(shell): SSR-safe sidebar nav + toolbar (TanStack Link, props-driven)"
```

---

### Task 4: Root layout — nav-tree loader + shell

**Files:**
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Rewrite `__root.tsx` to load the nav tree and render the shell**

```tsx
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../app.css?url";
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
				<AppToolbar />
				<div className="flex min-h-0 flex-1">
					<aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-sidebar lg:block">
						<SidebarNav
							tree={tree}
							activeSeriesSlug={activeSeriesSlug}
							activeSetSlug={activeSetSlug}
						/>
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
```

- [ ] **Step 2: Build + SSR-verify the sidebar renders series from live data**

Run:
```bash
bun run build
node .output/server/index.mjs &
SERVER_PID=$!
sleep 2.5
curl -s http://localhost:3000/ > /tmp/p3-root.html
kill $SERVER_PID
grep -q "Series" /tmp/p3-root.html && echo "SHELL OK"
```
Expected: prints `SHELL OK`; `/tmp/p3-root.html` contains at least one real series name (e.g. grep for a known series). If the nav tree is empty, the build-time/runtime fetch to `process.env.API_BASE` failed — confirm the Worker URL is set in the environment or that the public-origin fallback is reachable. Report the actual fetched series count.

- [ ] **Step 3: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat(routes): root layout loads nav tree, renders SSR shell"
```

---

### Task 5: Series page — booster-pack set tiles

**Files:**
- Create: `src/components/shell/set-tile.tsx`
- Create: `src/routes/$series/index.tsx`

- [ ] **Step 1: Implement the static set tile** `src/components/shell/set-tile.tsx`

```tsx
import { Link } from "@tanstack/react-router";
import type { NavSet } from "../../server/nav-tree";
import "../booster-pack/booster-pack.css";

/** Non-interactive booster-pack-styled tile that navigates to the set page. */
export function SetTile({ seriesSlug, set }: { seriesSlug: string; set: NavSet }) {
	return (
		<Link
			to="/$series/$set"
			params={{ series: seriesSlug, set: set.slug }}
			className="booster-pack"
			aria-label={`Browse ${set.name}`}
		>
			<span className="booster-pack-foil" aria-hidden="true" />
			<span className="booster-pack-art">
				<img className="booster-pack-logo" src={set.logo} alt="" />
				<strong className="booster-pack-name">{set.name}</strong>
			</span>
			<img className="booster-pack-symbol" src={set.symbol} alt="" aria-hidden="true" />
		</Link>
	);
}
```

- [ ] **Step 2: Implement the series route** `src/routes/$series/index.tsx`

```tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { cacheControl } from "../../server/cache-headers";
import { findSeries, getNavTreeFn } from "../../server/nav-tree";
import { SetTile } from "../../components/shell/set-tile";

export const Route = createFileRoute("/$series/")({
	loader: async ({ params }) => {
		const tree = await getNavTreeFn();
		const series = findSeries(tree, params.series);
		if (!series) throw notFound();
		setResponseHeaders({ "Cache-Control": cacheControl("static") });
		return series;
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.name ?? "Series"} — Pokémon TCG sets` },
			{ name: "description", content: `Browse every ${loaderData?.name ?? ""} set.` },
		],
	}),
	component: SeriesPage,
});

function SeriesPage() {
	const series = Route.useLoaderData();
	return (
		<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-6">
			<h1 className="mb-4 text-2xl font-bold">{series.name}</h1>
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
				{series.sets.map((set) => (
					<SetTile key={set.id} seriesSlug={series.slug} set={set} />
				))}
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Build + SSR-verify a real series page**

Run:
```bash
bun run build
node .output/server/index.mjs &
SERVER_PID=$!
sleep 2.5
# Pick a series slug from the root HTML; sword-shield is a safe bet, else use any /$series link present.
curl -s http://localhost:3000/sword-shield > /tmp/p3-series.html
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/sword-shield
echo ""
kill $SERVER_PID
grep -q "booster-pack" /tmp/p3-series.html && echo "SERIES OK"
```
Expected: HTTP 200, prints `SERIES OK` (set tiles present). If `sword-shield` 404s, the series slug differs — grep `/tmp/p3-root.html` from Task 4 for an actual `/$series` href and use that. Report which slug worked.

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/set-tile.tsx src/routes/$series/index.tsx
git commit -m "feat(routes): series page with booster-pack set tiles"
```

---

### Task 6: Set page — SSR card grid + per-set facets

**Files:**
- Create: `src/routes/$series/$set/index.tsx`

- [ ] **Step 1: Implement the set route.** Loader resolves the set, fetches ALL its cards (loop at pageSize 250), derives facets, SSRs the grid.

```tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { setResponseHeaders } from "@tanstack/react-start/server";
import type { HoloCardData } from "../../../components/holo-card";
import { cacheControl } from "../../../server/cache-headers";
import { getCardsBySetFn } from "../../../server/card-data";
import { findSet, getNavTreeFn } from "../../../server/nav-tree";
import { deriveFacets } from "../../../server/set-facets";

export const Route = createFileRoute("/$series/$set/")({
	loader: async ({ params }) => {
		const tree = await getNavTreeFn();
		const set = findSet(tree, params.series, params.set);
		if (!set) throw notFound();

		// Fetch the whole set so facets are accurate and all cards are crawlable.
		const all: HoloCardData[] = [];
		let page = 1;
		let total = Number.POSITIVE_INFINITY;
		while (all.length < total && page <= 10) {
			const res = await getCardsBySetFn({ data: { setId: set.id, page, pageSize: 250 } });
			all.push(...res.cards);
			total = res.totalCount;
			if (res.cards.length === 0) break;
			page++;
		}
		setResponseHeaders({ "Cache-Control": cacheControl("ssr") });
		return { set, cards: all, facets: deriveFacets(all) };
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.set.name ?? "Set"} — Pokémon TCG cards` },
			{ name: "description", content: `All ${loaderData?.cards.length ?? 0} cards in ${loaderData?.set.name ?? ""}.` },
		],
	}),
	component: SetPage,
});

function SetPage() {
	const { set, cards, facets } = Route.useLoaderData();
	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-y-auto px-4 py-5">
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">{set.name}</h1>
				<span className="text-sm text-muted-foreground">{cards.length} cards</span>
			</div>
			{/* Facets render as plain text chips for now; the interactive filter island is Plan 05. */}
			<div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
				{facets.supertypes.map((s) => <span key={s} className="rounded bg-secondary px-2 py-1">{s}</span>)}
				{facets.rarities.map((r) => <span key={r} className="rounded bg-secondary px-2 py-1">{r}</span>)}
			</div>
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{cards.map((card) => (
					<li key={card.id} className="flex flex-col items-center gap-1">
						<img src={card.imageUrlSmall} alt={card.name} loading="lazy" className="w-full rounded" />
						<span className="text-center text-xs">{card.name}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
```

Note (Assumption 2): cards are NOT yet links — `/{series}/{set}/{card}` routes + per-card links come in Plan 04 (needs the corpus for card slugs). The card names + images ARE in the SSR HTML, which is the set-page SEO payload.

- [ ] **Step 2: Build + SSR-verify a real set page contains card names**

Run:
```bash
bun run build
node .output/server/index.mjs &
SERVER_PID=$!
sleep 2.5
# Use a known set under sword-shield; grep root/series HTML for an actual /$series/$set href if this 404s.
curl -s -o /tmp/p3-set.html -w "%{http_code}\n" http://localhost:3000/sword-shield/brilliant-stars
kill $SERVER_PID
# Assert multiple card <img> + names are present (crawlable payload).
grep -c "rounded" /tmp/p3-set.html
echo "bytes:"; wc -c < /tmp/p3-set.html
```
Expected: HTTP 200; many matches; a large HTML body (a full set is hundreds of cards). If 404, derive the real set slug from the series page HTML and report which worked. Confirm the `Cache-Control` header: `curl -sI .../sword-shield/brilliant-stars | grep -i cache-control` → should show `s-maxage=3600`.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/\$series/\$set/index.tsx"
git commit -m "feat(routes): set page — SSR all cards + per-set facets + SWR headers"
```

---

### Task 7: Prerender series pages + verification gate

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add prerender config to `tanstackStart()` in `vite.config.ts`**

Add the `prerender` option to the existing `tanstackStart({ srcDirectory: "src" })` call:
```ts
		tanstackStart({
			srcDirectory: "src",
			prerender: {
				enabled: true,
				crawlLinks: true,
				// Prerender only the home + single-segment series pages. Sets/cards
				// stay SSR + SWR (rendered on demand, cached at the edge/nginx).
				filter: ({ path }) => {
					const segments = path.split("/").filter(Boolean);
					return segments.length <= 1;
				},
				failOnError: false,
			},
		}),
```

- [ ] **Step 2: Build and confirm series pages prerendered, sets NOT**

Run:
```bash
bun run build 2>&1 | tail -20
echo "--- prerendered HTML files ---"
find .output -name "*.html" 2>/dev/null | head -40
```
Expected: build exits 0; `.output` contains prerendered `index.html` for `/` and for each `/{series}` (e.g. `sword-shield/index.html`), but NOT for `/{series}/{set}` paths. Report which series prerendered + the count. If prerender fails because the data fetch is unreachable at build, set the data-source env var or note it as a build-env requirement (Assumption 6) — do NOT disable prerender to make it pass without reporting.

- [ ] **Step 3: Full verification gate (parallel)**

Run (single batch): `bun run typecheck`, `bun run lint` (or `biome check --config-path=. src`), `bun test`.
Expected: typecheck 0; lint clean; all tests pass (~289 prior + nav-tree 6 + facets 2 + sidebar 1). Quote any failure exactly.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "build(routes): prerender home + series pages (sets/cards stay SSR+SWR)"
```

---

## Self-review

- **Spec coverage:** `map.md` rows `__root` (nav loader+sidebar ✓), `$series/index` (booster packs ✓), `$set/route`+`index` (cards SSR + per-set facets ✓), `ssr-prerender` for series ✓. `$set/route.tsx` as a *separate* layout file was folded into `$set/index.tsx` (search bar belongs with the interactive island — Plan 05); noted, not silently dropped. `$card`/`search`/`pokemon` are explicitly Plan 04.
- **Placeholders:** none — full code per file. Facet/tile UIs are intentionally static (interactivity = Plan 05), which is a scope boundary, not a placeholder.
- **Type consistency:** `NavTree`/`NavSeries`/`NavSet` defined Task 1, consumed by `SidebarNav` (T3), `SetTile` (T5), root + routes (T4–6). `findSeries`/`findSet` signatures stable across tasks. `SetFacets` defined T2, used T6. `getCardsBySetFn` called with `{ data: {...} }` (the createServerFn call shape from Plan 02).
- **Risk:** the SSR `curl` checks depend on the data source being reachable at build/run (Assumption 6). The set-page full-fetch loop is bounded (`page <= 10`) to avoid runaway. `useRouterState` segment-derivation for active slugs is presentational only.

## Carried forward

- Card detail, search, pokémon entity → Plan 04 (needs server corpus for card slugs).
- Interactive sidebar collapse, virtual grid, holo, real filter controls → Plan 05 islands.
- `$set/$card` links from the set grid → Plan 04 once card slugs exist.
- Mobile sidebar sheet (toolbar hamburger) → Plan 05 (interactive).

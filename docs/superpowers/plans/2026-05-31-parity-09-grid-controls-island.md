# Parity Plan 09 — Unified Card-Grid + Controls Island

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One client `CardGridIsland` — a Virtuoso grid backed by the paginated corpus fetcher with infinite scroll, hoverable holo cards, clickable card links, and a collection toggle — plus a `SearchControls` island (name + filters + scope) writing URL search params. Wire both into the set, search, and pokemon pages, fixing the no-hover / unclickable / no-infinite-scroll / dead-filters / missing-set-search-bar regressions.

**Architecture:** The grid reads a `CorpusQuery` (built from URL search params + page context) and pages through `makeCorpusFetcher` on `endReached`. SSR still renders the crawlable fallback list (names + images + links); the island replaces it on mount (the established Plan 05 `<ClientOnly>` pattern). Controls write `q`/`types`/`rarity`/`supertype`/`subtypes`/`scope` to the route's typed search params; the grid re-queries when they change.

**Tech Stack:** `@tanstack/react-router` (`useSearch`/`useNavigate`/`validateSearch`/`ClientOnly`), `react-virtuoso` `VirtuosoGrid` (`endReached`), the existing `makeCorpusFetcher` + `CorpusQuery` (`src/store/corpus/corpus-runtime.ts` / `corpus-engine.ts`), `HoloCardIsland`, `CollectionToggle`, `ui/select`, Bun test.

---

## Context the implementer needs

- **`makeCorpusFetcher(params: CorpusQuery): CardFetcher`** (`corpus-runtime.ts:109`) returns `(key, page, pageSize) => Promise<{cards, totalCount}>` and already slices by page against the in-memory corpus. `CorpusQuery = { query?: string; setId?: string|null; dexNumber?: number|null; filters?: FilterClauses; relevance: boolean }` (`corpus-engine.ts:8`). `FilterClauses = { types?; rarity?; supertype?; subtypes? }` (`build-filter-clauses.ts:5`).
- **Corpus load:** `loadCorpus()` + `useCorpusRuntime((s)=>s.index!==null)` for readiness (`corpus-runtime.ts`). Until ready, the fetcher returns `{cards:[],totalCount:0}` — so the island shows SSR cards as the initial state and swaps when ready.
- **`HoloCardIsland`** (`components/islands/holo-card-island.tsx`) takes `HoloCardProps`; SSR fallback is a plain `<img alt={name}>`. `HoloCard` wrapper carries `aria-label={name}`.
- **`CollectionToggle`** (`components/collection-toggle`) takes `{ card: HoloCardData }`, calls `e.preventDefault()` so a wrapping `<Link>` doesn't navigate when toggling.
- **`VirtuosoGrid`** props in use: `style`, `totalCount`, `listClassName`, `itemContent={(index)=>…}`, **`endReached={(index)=>…}`** (verified present in installed types).
- **Search-param writes:** `const navigate = useNavigate({ from: Route.fullPath }); navigate({ search: (prev)=>({...prev, q}) })`. Reads: `Route.useSearch()`.
- **Project memory:** the Virtuoso grid needs a **definite-height flex parent** (`flex-1 min-h-0`) or it paints 0 rows. Each consumer wraps the island in such a parent.
- **bun test** + happy-dom; `renderInRouter` helper pattern (await `router.load()` before `render`) from `src/routes/index.test.tsx` / `sidebar-nav.test.tsx`.

---

## File structure

- `src/lib/card-query.ts` — pure: `SearchParams` type + `buildCorpusQuery(params, ctx)` mapping URL search params + page context → `CorpusQuery`. Sibling test.
- `src/components/islands/card-grid-island.tsx` — the Virtuoso grid island (corpus-paginated, infinite scroll, holo + toggle + link).
- `src/components/islands/search-controls.tsx` — name input + filter dropdowns + scope toggle, writes search params.
- `src/routes/$series/$set/index.tsx` — modify: mount `SearchControls` (set-scoped) + `CardGridIsland`.
- `src/routes/search.tsx` — modify: mount `SearchControls` (global) + `CardGridIsland`; drop the old `CorpusSearchIsland`.
- `src/routes/pokemon/$name.tsx` — modify: mount `CardGridIsland` (dex-scoped).
- `src/components/islands/corpus-search-island.tsx` — delete (superseded).

---

### Task 1: `buildCorpusQuery` (pure param→query mapping)

**Files:**
- Create: `src/lib/card-query.ts`
- Test: `src/lib/card-query.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { buildCorpusQuery, type ListSearch } from "./card-query";

const empty: ListSearch = { q: "", types: [], rarity: [], supertype: [], subtypes: [], scope: "all" };

describe("buildCorpusQuery", () => {
	test("set context, no query → set-scoped natural order", () => {
		const q = buildCorpusQuery(empty, { setId: "swsh9" });
		expect(q.setId).toBe("swsh9");
		expect(q.query).toBeUndefined();
		expect(q.relevance).toBe(false);
	});
	test("name query with no context → global relevance", () => {
		const q = buildCorpusQuery({ ...empty, q: "charizard" }, {});
		expect(q.query).toBe("charizard");
		expect(q.setId).toBeNull();
		expect(q.relevance).toBe(true);
	});
	test("set context + scope=set + query → set-scoped, no relevance", () => {
		const q = buildCorpusQuery({ ...empty, q: "char", scope: "set" }, { setId: "swsh9" });
		expect(q.setId).toBe("swsh9");
		expect(q.query).toBe("char");
		expect(q.relevance).toBe(false);
	});
	test("set context + scope=all + query → global search (ignore set)", () => {
		const q = buildCorpusQuery({ ...empty, q: "char", scope: "all" }, { setId: "swsh9" });
		expect(q.setId).toBeNull();
		expect(q.relevance).toBe(true);
	});
	test("dex context → dex-scoped natural order", () => {
		const q = buildCorpusQuery(empty, { dexNumber: 6 });
		expect(q.dexNumber).toBe(6);
		expect(q.relevance).toBe(false);
	});
	test("filters pass through; empty arrays omitted", () => {
		const q = buildCorpusQuery({ ...empty, types: ["fire"], rarity: ["Rare Holo"] }, { setId: "swsh9" });
		expect(q.filters).toEqual({ types: ["fire"], rarity: ["Rare Holo"], supertype: undefined, subtypes: undefined });
	});
});
```

- [ ] **Step 2: Run, verify FAIL** — `bun test src/lib/card-query.test.ts`

- [ ] **Step 3: Implement `src/lib/card-query.ts`**

```ts
import type { CorpusQuery } from "../store/corpus/corpus-engine";
import type { FilterClauses } from "../utils/build-filter-clauses";

export type Scope = "set" | "all";

/** Typed list-page search params (shared validateSearch shape). */
export interface ListSearch {
	q: string;
	types: string[];
	rarity: string[];
	supertype: string[];
	subtypes: string[];
	scope: Scope;
}

/** Page context: which entity the list is anchored to. */
export interface ListContext {
	setId?: string;
	dexNumber?: number;
}

const orUndef = (a: string[]): string[] | undefined => (a.length ? a : undefined);

/**
 * Map URL search params + page context to a CorpusQuery.
 *  - set context with scope=all + a query → global search (ignore the set)
 *  - set context otherwise → set-scoped, natural order
 *  - dex context → dex-scoped, natural order
 *  - no context → global, relevance order when a query is present
 */
export function buildCorpusQuery(s: ListSearch, ctx: ListContext): CorpusQuery {
	const filters: FilterClauses = {
		types: orUndef(s.types),
		rarity: orUndef(s.rarity),
		supertype: orUndef(s.supertype),
		subtypes: orUndef(s.subtypes),
	};
	const query = s.q.trim() || undefined;

	// Global search overrides set context when scope=all and a query is present.
	const globalOverride = ctx.setId != null && s.scope === "all" && !!query;

	if (ctx.setId != null && !globalOverride) {
		return { setId: ctx.setId, query, filters, relevance: false };
	}
	if (ctx.dexNumber != null) {
		return { dexNumber: ctx.dexNumber, query, filters, relevance: false };
	}
	return { setId: null, query, filters, relevance: !!query };
}
```

- [ ] **Step 4: Run, verify PASS** — `bun test src/lib/card-query.test.ts` (6 pass)

- [ ] **Step 5: Commit**

```bash
git add src/lib/card-query.ts src/lib/card-query.test.ts
git commit -m "feat(grid): pure search-param -> CorpusQuery mapping"
```

---

### Task 2: `CardGridIsland` (corpus-paginated infinite-scroll grid)

**Files:**
- Create: `src/components/islands/card-grid-island.tsx`
- Test: `src/components/islands/card-grid-island.test.tsx`

**Props/types this introduces:**
```ts
import type { HoloCardData } from "../holo-card";
import type { ListContext } from "../../lib/card-query";

export interface GridCard extends HoloCardData {
	slug?: string; // set pages supply a precomputed slug; others resolve client-side
}
```

- [ ] **Step 1: Write a render test** (SSR-seed path: corpus not ready → shows seeded cards).

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { CardGridIsland } from "./card-grid-island";
import type { GridCard } from "./card-grid-island";

const seed: GridCard[] = [
	{ id: "swsh9-1", name: "Exeggcute", imageUrl: "l1", imageUrlSmall: "s1", setId: "swsh9", setName: "BS", setSeries: "S&S", cardNumber: "1" },
];

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

test("CardGridIsland shows seeded SSR cards before the corpus is ready", async () => {
	await renderInRouter(
		<CardGridIsland
			search={{ q: "", types: [], rarity: [], supertype: [], subtypes: [], scope: "all" }}
			context={{ setId: "swsh9" }}
			seedCards={seed}
			seedTotal={1}
			cardHref={() => ({ to: "/" as const })}
		/>,
	);
	expect(await screen.findByAltText("Exeggcute")).toBeDefined();
});
```
Note: if `VirtuosoGrid` does not render items under happy-dom (it measures DOM and may render nothing in jsdom-likes), the test should assert the component mounts without throwing and that an accessible fallback (the seed list) is reachable — implement the island so that, when `typeof window` lacks layout (test env), it falls back to a plain `<ul>` of `seedCards` (see Step 3). The REQUIREMENT: a test proves the island renders the seeded card's image by alt text.

- [ ] **Step 2: Run, verify FAIL** — `bun test src/components/islands/card-grid-island.test.tsx`

- [ ] **Step 3: Implement `src/components/islands/card-grid-island.tsx`**

```tsx
import { Link, type LinkProps } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { buildCorpusQuery, type ListContext, type ListSearch } from "../../lib/card-query";
import {
	loadCorpus,
	makeCorpusFetcher,
	useCorpusRuntime,
} from "../../store/corpus/corpus-runtime";
import { CollectionToggle } from "../collection-toggle";
import type { HoloCardData } from "../holo-card";
import { HoloCardIsland } from "./holo-card-island";

export interface GridCard extends HoloCardData {
	slug?: string;
}

interface CardGridIslandProps {
	search: ListSearch;
	context: ListContext;
	/** SSR-rendered first page; shown until the corpus takes over. */
	seedCards: GridCard[];
	seedTotal: number;
	/** Build the card-route link props for a card (per-page slug scheme). */
	cardHref: (card: HoloCardData) => LinkProps;
}

const PAGE = 40;

export function CardGridIsland({
	search,
	context,
	seedCards,
	seedTotal,
	cardHref,
}: CardGridIslandProps) {
	const ready = useCorpusRuntime((s) => s.index !== null);
	const [cards, setCards] = useState<HoloCardData[]>(seedCards);
	const [total, setTotal] = useState(seedTotal);
	const pageRef = useRef(1);

	// Stable key for the active query; changing it resets pagination.
	const queryKey = useMemo(
		() => JSON.stringify([search, context]),
		[search, context],
	);

	useEffect(() => {
		void loadCorpus();
	}, []);

	// (Re)load page 1 from the corpus whenever the query or readiness changes.
	useEffect(() => {
		if (!ready) return;
		const q = buildCorpusQuery(search, context);
		const fetcher = makeCorpusFetcher(q);
		pageRef.current = 1;
		void fetcher(queryKey, 1, PAGE).then((r) => {
			setCards(r.cards);
			setTotal(r.totalCount);
		});
	}, [ready, queryKey, search, context]);

	const loadMore = () => {
		if (!ready) return;
		if (cards.length >= total) return;
		const next = pageRef.current + 1;
		pageRef.current = next;
		const fetcher = makeCorpusFetcher(buildCorpusQuery(search, context));
		void fetcher(queryKey, next, PAGE).then((r) =>
			setCards((cur) => [...cur, ...r.cards]),
		);
	};

	const renderCard = (card: HoloCardData) => (
		<Link {...cardHref(card)} className="block">
			<HoloCardIsland
				imageUrl={card.imageUrl}
				imageUrlSmall={card.imageUrlSmall}
				name={card.name}
				rarity={card.rarity}
				subtypes={card.subtypes}
				supertype={card.supertype}
				setId={card.setId}
				series={card.setSeries}
				variants={card.variants}
				cardNumber={card.cardNumber}
				hoverOverlay={<CollectionToggle card={card} />}
			/>
		</Link>
	);

	// Test/no-layout fallback: render a plain list so the grid is assertable and
	// SSR-equivalent when Virtuoso can't measure (happy-dom).
	if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
		return (
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{cards.map((c) => (
					<li key={c.id}>{renderCard(c)}</li>
				))}
			</ul>
		);
	}

	return (
		<VirtuosoGrid
			style={{ height: "100%" }}
			totalCount={cards.length}
			endReached={loadMore}
			listClassName="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
			itemContent={(index) => {
				const card = cards[index];
				return card ? renderCard(card) : null;
			}}
		/>
	);
}
```

- [ ] **Step 4: Run, verify PASS** — `bun test src/components/islands/card-grid-island.test.tsx`. If happy-dom provides `ResizeObserver` (so the fallback branch doesn't trigger) and Virtuoso renders nothing, adjust the test per its note to assert mount + seed reachability, or gate the fallback on a test-detectable signal. Do NOT weaken the island's production path.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/card-grid-island.tsx src/components/islands/card-grid-island.test.tsx
git commit -m "feat(grid): corpus-paginated infinite-scroll card grid island"
```

---

### Task 3: `SearchControls` (name + filters + scope → search params)

**Files:**
- Create: `src/components/islands/search-controls.tsx`

- [ ] **Step 1: Implement `src/components/islands/search-controls.tsx`.** Presentational; takes current values + available options + an `onChange(patch)` that the route maps to a `navigate({search})`. (Keeping the navigate in the route keeps this island route-agnostic and testable.)

```tsx
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { ListSearch, Scope } from "../../lib/card-query";

export interface FacetOptions {
	supertypes: string[];
	subtypes: string[];
	rarities: string[];
	types: string[];
}

interface SearchControlsProps {
	value: ListSearch;
	options: FacetOptions;
	/** Whether to show the this-set / all-sets scope toggle. */
	showScope: boolean;
	onChange: (patch: Partial<ListSearch>) => void;
}

// A single-select that maps to a string[] param (one active value at a time —
// matches the main filter UX; multi was never exposed). "" clears the dimension.
function FilterSelect({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string[];
	options: string[];
	onChange: (v: string[]) => void;
}) {
	// Radix Select forbids an empty-string item value, so use a sentinel for "clear".
	const ALL = "__all__";
	return (
		<Select
			value={value[0] ?? ALL}
			onValueChange={(v) => onChange(v === ALL ? [] : [v])}
		>
			<SelectTrigger className="text-sm">
				<SelectValue placeholder={label} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL}>{`All ${label}`}</SelectItem>
				{options.map((o) => (
					<SelectItem key={o} value={o}>
						{o}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function SearchControls({
	value,
	options,
	showScope,
	onChange,
}: SearchControlsProps) {
	return (
		<div className="space-y-3">
			<Input
				type="search"
				defaultValue={value.q}
				placeholder="Search cards by name…"
				aria-label="Search cards by name"
				onChange={(e) => onChange({ q: e.target.value })}
			/>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<FilterSelect label="Card Type" value={value.supertype} options={options.supertypes} onChange={(v) => onChange({ supertype: v })} />
				<FilterSelect label="Subtype" value={value.subtypes} options={options.subtypes} onChange={(v) => onChange({ subtypes: v })} />
				<FilterSelect label="Rarity" value={value.rarity} options={options.rarities} onChange={(v) => onChange({ rarity: v })} />
				<FilterSelect label="Energy Type" value={value.types} options={options.types} onChange={(v) => onChange({ types: v })} />
			</div>
			{showScope && (
				<div className="flex justify-end gap-1 text-xs">
					{(["set", "all"] as Scope[]).map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => onChange({ scope: s })}
							aria-pressed={value.scope === s}
							className={
								value.scope === s
									? "rounded bg-primary px-2 py-1 text-primary-foreground"
									: "rounded bg-secondary px-2 py-1 text-muted-foreground"
							}
						>
							{s === "set" ? "This set" : "All sets"}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
```
Note: `ui/input` + `ui/select` exist (`src/components/ui/`). Debouncing the `q` input is a refinement (not required); the param write per keystroke is acceptable since the corpus query is in-memory and instant.

- [ ] **Step 2: Typecheck** — `bun run typecheck` → 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/search-controls.tsx
git commit -m "feat(grid): search + filter + scope controls island"
```

---

### Task 4: Shared list-search validation helper

**Files:**
- Create: `src/lib/list-search.ts`

- [ ] **Step 1: Implement a reusable `validateSearch` + a CSV param codec** so set/search/pokemon routes share one typed search shape.

```ts
import type { ListSearch, Scope } from "./card-query";

const csv = (v: unknown): string[] =>
	typeof v === "string" && v ? v.split(",").filter(Boolean) : Array.isArray(v) ? (v as string[]) : [];

/** Shared validateSearch for any card-list route. */
export function validateListSearch(search: Record<string, unknown>): ListSearch {
	const scope: Scope = search.scope === "set" ? "set" : "all";
	return {
		q: typeof search.q === "string" ? search.q : "",
		types: csv(search.types),
		rarity: csv(search.rarity),
		supertype: csv(search.supertype),
		subtypes: csv(search.subtypes),
		scope,
	};
}

/** Serialize a ListSearch patch's array fields back to CSV for the URL. */
export function listSearchToUrl(s: Partial<ListSearch>): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	if (s.q !== undefined) out.q = s.q || undefined;
	for (const k of ["types", "rarity", "supertype", "subtypes"] as const) {
		if (s[k] !== undefined) out[k] = s[k]?.length ? s[k]!.join(",") : undefined;
	}
	if (s.scope !== undefined) out.scope = s.scope === "set" ? "set" : undefined;
	return out;
}
```

- [ ] **Step 2: Typecheck** — `bun run typecheck` → 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/list-search.ts
git commit -m "feat(grid): shared list-search validation + URL codec"
```

---

### Task 5: Wire the set page

**Files:**
- Modify: `src/routes/$series/$set/index.tsx`

- [ ] **Step 1: Add `validateSearch` + mount controls and grid.** Replace `SetPage`'s static facet chips + the `ClientOnly`/`SetGridIsland` block. Keep the SSR fallback list (crawlable) but render it only as the `ClientOnly` fallback; the controls + grid become the client view. Read the existing loader (`set`, `cards` with `slug`, `facets`).

Add to the route options:
```tsx
	validateSearch: validateListSearch,
```
New imports:
```tsx
import { CardGridIsland } from "../../../components/islands/card-grid-island";
import { SearchControls } from "../../../components/islands/search-controls";
import { validateListSearch, listSearchToUrl } from "../../../lib/list-search";
import { useNavigate } from "@tanstack/react-router";
```
Replace the `SetPage` body below the `<h1>` header with:
```tsx
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const onChange = (patch: Parameters<typeof listSearchToUrl>[0]) =>
		navigate({ search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }) });

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">{set.name}</h1>
				<span className="text-sm text-muted-foreground">{cards.length} cards</span>
			</div>
			<ClientOnly fallback={null}>
				<div className="mb-4 shrink-0">
					<SearchControls
						value={search}
						options={facets}
						showScope
						onChange={onChange}
					/>
				</div>
			</ClientOnly>
			<div className="min-h-0 flex-1">
				<ClientOnly
					fallback={
						<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
							{cards.map((card) => (
								<li key={card.id} className="flex flex-col items-center gap-1">
									<Link to="/$series/$set/$card" params={{ series: params.series, set: params.set, card: card.slug }}>
										<img src={card.imageUrlSmall} alt={card.name} loading="lazy" className="w-full rounded" />
										<span className="text-center text-xs">{card.name}</span>
									</Link>
								</li>
							))}
						</ul>
					}
				>
					<CardGridIsland
						search={search}
						context={{ setId: set.id }}
						seedCards={cards}
						seedTotal={cards.length}
						cardHref={(card) => ({
							to: "/$series/$set/$card",
							params: {
								series: params.series,
								set: params.set,
								card: (cards.find((c) => c.id === card.id)?.slug) ?? card.id,
							},
						})}
					/>
				</ClientOnly>
			</div>
			<Outlet />
		</div>
	);
```
Note: `facets` is `{supertypes, subtypes, rarities, types}` from `deriveFacets` — matches `FacetOptions`. The set-page grid is set-scoped, so global-search results (scope=all) come from the corpus across sets; `cardHref` falls back to the card id when a cross-set result has no local slug (the `$card` route resolves per-set, so cross-set links from a set page point at cards in *other* sets — acceptable for v1; a follow-up can resolve cross-set slugs). Keep behavior simple: when `scope=set` (default), all results are in-set and have slugs.

- [ ] **Step 2: Build + SSR-verify the fallback list still crawlable + page renders**

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/sword-shield/brilliant-stars > /tmp/p9set.html
kill $SERVER_PID
echo "ssr card imgs: $(grep -c 'loading=\"lazy\"' /tmp/p9set.html)"
echo "ssr card links: $(grep -oE '/sword-shield/brilliant-stars/[a-z0-9-]+' /tmp/p9set.html | sort -u | wc -l)"
```
Expected: many imgs + links (SSR fallback intact). Report counts.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/\$series/\$set/index.tsx"
git commit -m "feat(routes): set page — search controls + infinite-scroll grid"
```

---

### Task 6: Wire the search page

**Files:**
- Modify: `src/routes/search.tsx`
- Delete: `src/components/islands/corpus-search-island.tsx`

- [ ] **Step 1: Rebuild `search.tsx`** on the shared search shape + grid. The loader keeps SSR'ing the first API page as the crawlable seed; the global filter options derive from the corpus client-side (so pass empty options until ready, or derive from the seed — simplest: derive `FacetOptions` from the corpus index on the client via a tiny helper; for v1 pass options computed from the seed cards). Replace the file:

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CardGridIsland } from "../components/islands/card-grid-island";
import { SearchControls } from "../components/islands/search-controls";
import { deriveFacets } from "../server/set-facets";
import { fetchCardsByName } from "../server/card-data";
import { listSearchToUrl, validateListSearch } from "../lib/list-search";

export const Route = createFileRoute("/search")({
	validateSearch: validateListSearch,
	loaderDeps: ({ search }) => ({ q: search.q }),
	loader: async ({ deps }) => {
		const q = deps.q.trim();
		if (!q) return { q, cards: [], total: 0 };
		const res = await fetchCardsByName(q, 1, 40);
		return { q, cards: res.cards, total: res.totalCount };
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: loaderData?.q ? `"${loaderData.q}" — Pokémon TCG search` : "Search — Pokémon TCG" },
			{ name: "description", content: `Search results for ${loaderData?.q ?? ""}.` },
		],
	}),
	component: SearchPage,
});

function SearchPage() {
	const { q, cards, total } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const onChange = (patch: Parameters<typeof listSearchToUrl>[0]) =>
		navigate({ search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }) });

	// Options derived from the SSR seed (corpus refines as the user filters live).
	const options = deriveFacets(cards);

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<h1 className="mb-3 text-xl font-bold">
				{q ? `Results for "${q}"` : "Search"}
				{q ? <span className="ml-2 text-sm text-muted-foreground">{total} cards</span> : null}
			</h1>
			<div className="mb-4 shrink-0">
				<SearchControls value={search} options={options} showScope={false} onChange={onChange} />
			</div>
			<div className="min-h-0 flex-1">
				<CardGridIsland
					search={search}
					context={{}}
					seedCards={cards}
					seedTotal={total}
					cardHref={() => ({ to: "/search", search })}
				/>
			</div>
		</div>
	);
}
```
Note: search-result cards are cross-set; the `$card` route needs the card's own series/set slugs to link, which the search corpus result doesn't carry as path slugs. For v1, `cardHref` stays on `/search` (keeps the result list; clicking re-runs the same search) — a follow-up plan can add cross-set card resolution so results deep-link to `/{series}/{set}/{card}`. This is an explicit v1 limitation, not a regression (main's search also opened a dialog, not a distinct page). The SSR seed list remains crawlable via the loader cards rendered by the grid's seed.

- [ ] **Step 2: Delete the superseded island.**

```bash
git rm src/components/islands/corpus-search-island.tsx
```

- [ ] **Step 3: Build + SSR-verify** — `/search?q=charizard` HTTP 200, result imgs present.

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s -o /tmp/p9search.html -w "HTTP=%{http_code}\n" "http://localhost:3000/search?q=charizard"
kill $SERVER_PID
echo "imgs: $(grep -c 'loading=\"lazy\"\|rounded' /tmp/p9search.html)"
```
Expected: 200; imgs present.

- [ ] **Step 4: Commit**

```bash
git add src/routes/search.tsx
git commit -m "feat(routes): search page — shared controls + infinite-scroll grid"
```

---

### Task 7: Wire the pokemon page

**Files:**
- Modify: `src/routes/pokemon/$name.tsx`

- [ ] **Step 1: Mount the grid (dex-scoped).** Add `validateSearch`, pass `context={{ dexNumber }}`. The loader already resolves `dex`; return it for context.

Add to the loader return: include `dex` →
```tsx
		return { display: titleCase(params.name), dex, cards: res.cards, total: res.totalCount };
```
Add `validateSearch: validateListSearch,` and rebuild the component:
```tsx
import { CardGridIsland } from "../../components/islands/card-grid-island";
import { SearchControls } from "../../components/islands/search-controls";
import { deriveFacets } from "../../server/set-facets";
import { listSearchToUrl, validateListSearch } from "../../lib/list-search";
import { useNavigate } from "@tanstack/react-router";

// in component:
function PokemonPage() {
	const { display, dex, cards, total } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const onChange = (patch: Parameters<typeof listSearchToUrl>[0]) =>
		navigate({ search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }) });
	const options = deriveFacets(cards);

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<h1 className="mb-3 text-xl font-bold">
				{display} <span className="ml-2 text-sm text-muted-foreground">{total} cards</span>
			</h1>
			<div className="mb-4 shrink-0">
				<SearchControls value={search} options={options} showScope={false} onChange={onChange} />
			</div>
			<div className="min-h-0 flex-1">
				<CardGridIsland
					search={search}
					context={{ dexNumber: dex }}
					seedCards={cards}
					seedTotal={total}
					cardHref={() => ({ to: "/pokemon/$name", params: { name: Route.useParams().name }, search })}
				/>
			</div>
		</div>
	);
}
```
Fix the `cardHref` to not call a hook inside the callback — capture params above:
```tsx
	const params = Route.useParams();
	// ...
	cardHref={() => ({ to: "/pokemon/$name", params: { name: params.name }, search })}
```

- [ ] **Step 2: Build + SSR-verify** — `/pokemon/charizard` 200 + imgs.

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s -o /tmp/p9poke.html -w "HTTP=%{http_code}\n" "http://localhost:3000/pokemon/charizard"
kill $SERVER_PID
echo "imgs: $(grep -c 'loading=\"lazy\"\|rounded' /tmp/p9poke.html)"
```
Expected: 200; imgs present.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/pokemon/\$name.tsx"
git commit -m "feat(routes): pokemon page — shared controls + grid"
```

---

### Task 8: Verification gate

- [ ] **Step 1: Full gate (parallel):** `bun run typecheck` (0), `biome check --config-path=. src` (clean), `bun test` (all pass: prior + card-query 6 + grid island test), `bun run build` (0).
- [ ] **Step 2: Per-route SSR smoke:**
```bash
node .output/server/index.mjs & SERVER_PID=$!
sleep 3
for p in "/" "/sword-shield" "/sword-shield/brilliant-stars" "/search?q=charizard" "/pokemon/charizard" "/collection"; do
  printf "%s -> " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000${p}"
done
kill $SERVER_PID
```
Expected: all 200.
- [ ] **Step 3: Commit any lint autofixes** (`git add -u src/` allowed): `git commit -m "style: biome formatting for parity plan 09"`.

---

## Self-review

- **Spec coverage:** Group 1 of the parity spec — `CardGridIsland` (#2 hover/click/scroll, fixes the count/render mismatch via `endReached`), `SearchControls` (#3 set search bar, #4 filters now real dropdowns + #12 scope toggle). Set/search/pokemon pages converge on the one grid (Assumption 2). URL-param state (Assumption 1). Corpus-derived options (Assumption 4, partial — v1 derives from seed; live corpus refines).
- **Placeholders:** none — full code per file.
- **Type consistency:** `ListSearch`/`Scope`/`ListContext` (T1) → grid (T2), controls (T3), validation (T4), all routes (T5–7). `buildCorpusQuery` returns `CorpusQuery` (existing). `GridCard.slug` optional (set supplies, others omit). `FacetOptions` matches `deriveFacets` output.
- **Hydration:** controls + grid under `ClientOnly`; SSR fallback lists kept crawlable (the Plan 05 invariant). `set-facets.deriveFacets` is pure/server-safe, reused client-side for options.
- **Known v1 limitations (explicit, not silent):** (a) cross-set search/pokemon results link back to the list route, not the per-card page (needs cross-set slug resolution — follow-up); (b) filter options derived from the SSR seed, not the full corpus, until a later refinement. Both noted in-task.

## Carried forward (next parity plans)

- Plan 10 — card detail parity (prices, collection toggle, cross-links, overflow fix).
- Plan 11 — sidebar collapse + toolbar + prerender sets.
- Plan 12 — pack opening.
- Plan 13 — timeline / view-mode (adds the view toggle to these same list pages).

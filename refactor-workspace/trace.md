# 🦆 Trace: pokemon-tcg-viewer — current data/routing/state flows

**In one sentence:** A single-page React app where *all* selection lives in URL **search params** on one `BrowsePage`, data is fetched client-side into Zustand caches (persisted to IndexedDB) with stale-while-revalidate, and an in-memory "corpus" index powers instant search once it loads on idle.

> **Traced:** `main.tsx` (router boot) → the five user-facing flows → exit (rendered grid / dialog / collection) · **Voice:** Matched · **Direction:** Top-down · **Depth:** Flow-level · **Files:** `main.tsx`, `root-layout.tsx`, `pages/*`, `hooks/*`, `store/*`, `api.ts`

**Migration tags** (added on top of the trace, per systematic-refactor):
`[PORT]` reused ~as-is · `[→ISLAND]` becomes a client-only hydrated island · `[→LOADER]` becomes a server route loader / server fn · `[REDESIGN]` no clean 1:1 — rethink · `[CLIENT-ONLY]` touches browser-only APIs, SSR-unsafe

---

## Flow 1 — Boot + corpus load

1. **Router boots** — `main.tsx:13` — `createBrowserRouter` with one `RootLayout` + nested `BrowsePage`; basename = `import.meta.env.BASE_URL` (`/pokemon-tcg-viewer/`). `[REDESIGN]` whole router → TanStack file-routes; basename drops (served at root).
2. **RootLayout mounts** — `root-layout.tsx:9` — schedules `loadCorpus()` via `requestIdleCallback` (fallback `setTimeout 1500`). `[→ISLAND][CLIENT-ONLY]`
3. **Corpus loads** — `store/corpus/corpus-runtime.ts:49` — conditional GET `/corpus`, decompress gzip, `buildIndex`, hold ~20k cards in a **non-persisted** in-memory store. Reused stored bytes on 304/offline. `[→ISLAND][CLIENT-ONLY]` (instant client search is inherently client-side)
4. **Sidebar renders** — `series-sidebar.tsx` — groups `sets` by their `series` string. `[→LOADER]` series/sets become loader data, prerendered (series) / SSR (sets).

## Flow 2 — Browse a set

1. **URL holds selection** — `?setId=swsh9` parsed by `useSetIdParam` — `hooks/use-url-selection.ts:17`. `[REDESIGN]` → path param `/{series}/{set}`.
2. **BrowsePage reads 8 params** — `pages/browse-page.tsx:32-41` — setId, q, scope, view, dex, types/rarity/supertype/subtypes. Branches: `showHome` (no set, no query) vs grid vs timeline. `[REDESIGN]` one mega-page → split across route files.
3. **Builds a cacheKey + picks a fetcher** — `browse-page.tsx:50-115` — corpus fetcher when `corpusReady`, else `apiFetcher` (`getCardsBySet`). Source-tagged key (`c:`/`a:`) so corpus swaps in mid-session. `[REDESIGN]` initial page → loader; client pagination/SWR stays.
4. **useCards orchestrates** — `hooks/use-cards.ts:28` — in-flight dedup, throttle, resize-suppression, SWR via `shouldRefetch`; pages appended to `cardsCache` (IDB-persisted). `[PORT]` keep for client-side load-more; first page now hydrates from loader.
5. **CardGrid renders** — `components/card-grid.tsx` — React Virtuoso virtual grid; each cell a `HoloCard` with pointer-reactive foil. `[→ISLAND]` `client:load` over SSR'd initial HTML.

## Flow 3 — Search (by-name / set-scoped / by-pokédex / timeline)

1. **SearchInput writes params** — `components/search-bar/search-input.tsx` + `search-bar.tsx:7` — `q`, `scope`, filter dims; `ScopeToggle` shown only when a set is selected. `[→ISLAND]`
2. **Same BrowsePage recompute** — `browse-page.tsx:44-66` — `searching` / `setScoped` flags re-key the fetcher. By-name = global; by-pokédex = `?dex=N` (`usePokedexParam`, `use-url-selection.ts:34`). `[REDESIGN]` global-search + by-pokédex have **no home** in a set-centric path tree — need explicit routes.
3. **Filters are GLOBAL today** — `hooks/use-filter-values.ts` feeds `SearchBar` from app-wide types/rarities/etc. `[REDESIGN]` user wants **per-set** facets computed from the set's actual cards (server-side in the set loader).
4. **Cross-links target search-param URLs** — `browse-page.tsx:124,131` + `collection-page.tsx:16` — e.g. ``to: `/?q=${name}` `` and ``/?setId=${id}``. `[REDESIGN]` every cross-link URL changes with the new path scheme.

## Flow 4 — Card detail

1. **Nested route + loader** — `main.tsx:24-28` — `card/:id` with `cardLoader` + `CardErrorPage`. `[PORT→LOADER]` near 1:1 to a TanStack route loader.
2. **Loader fetches** — `pages/card-loader.ts:5` — `getPrefetched(id) ?? getCardById(id)`; throws `Response(404)` on miss. `[→LOADER]` add `Cache-Control` SWR + OG meta here.
3. **Renders as dialog overlay** — `components/card-dialog/card-dialog.tsx` (296 LOC) — modal over BrowsePage; live prices via `price-lines.ts`. `[→ISLAND]` keep dialog on client nav; add **canonical SSR page** for direct/crawler hits (prices = client island, never in OG).

## Flow 5 — Collection (userland)

1. **Toggle writes store** — `collection-slice.ts:23` — `addToCollection` → `owned` map. `[→ISLAND][CLIENT-ONLY]`
2. **Persisted to IDB** — `store/index.ts:50-73` — `owned` in the partialized persisted set, via `idb-storage.ts` adapter (migrates legacy localStorage). `[CLIENT-ONLY]` IDB has no server equivalent.
3. **CollectionPage reads owned** — `collection-page.tsx:25` — renders the same `CardGrid`. `[→ISLAND]` page shell SSR-able, data client-only (`private, no-store`).

---

## State substrate (what persists where)

- **`useStore`** (`store/index.ts`) — IDB-persisted: `sets`, `pokemonList`, filter dims, `owned`, `packCards`, `cardsCache` (+order). Version 6, `partialize`d. `[CLIENT-ONLY]` persistence; **server data (sets/cards/filters) migrates to loaders**, client cache stays for nav.
- **`useRecentsStore`** (`recents.ts`) — localStorage: `recentSearches`, `recentlyViewed` (the home "history" the user wants as an island). `[→ISLAND][CLIENT-ONLY]`
- **`useCorpusRuntime`** — in-memory only, never persisted. `[→ISLAND]`
- **`freshness.ts`** — per-kind SWR TTLs (sets 7d, pokémonList 30d, cards 1d). `[PORT]` reuse as the loader/cache revalidation policy.

## Where the duck would squint 🦆 (migration hazards)

- **SSR hydration of persisted stores** — `store/index.ts`, `recents.ts`, `corpus-runtime.ts` all read IDB / localStorage / `requestIdleCallback`, none of which exist on the server. Rendering them during SSR → hydration mismatch. **Collection, recents, corpus must render empty/neutral on server and hydrate client-side** (tanstack-start `ssr-hydration-safety`).
- **`Date.now()` everywhere** — `use-cards.ts`, `collection-slice.ts`, `freshness.ts`, `corpus-runtime.ts` — server/client clock skew is fine here (no SSR'd timestamps in markup) but any timestamp rendered into SSR HTML would mismatch. Keep them out of SSR output.
- **Everything keys off search params** — 8 of them, on one page. The new path tree must preserve deep-linkability (`?q`, `?dex`, `?scope`, `?view`, filter CSVs) somewhere — they don't all map to clean path segments. `view`/`scope`/filters likely stay search params *under* the new path routes.
- **Series identity is fragile** — `series` is a raw display string; sets keyed by `id` (`swsh9`). Pretty `/{series}/{set}` slugs need a slug↔id map and a collision/rename policy.
- **`api.ts` returns browser-oriented data** — uses `import.meta.env.VITE_API_BASE` (`api.ts:14`); loaders running server-side can call the key'd origin directly instead. `[REDESIGN]` data-source seam moves server-side.

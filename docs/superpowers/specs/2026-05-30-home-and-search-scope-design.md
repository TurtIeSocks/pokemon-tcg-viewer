# Home, Recents & Search Scope — design

- **Date:** 2026-05-30
- **Branch:** `design-revamp` (follow-up to the shadcn migration)
- **Status:** Approved (brainstorming complete)

## Context

Post-migration review feedback. The app currently force-selects the newest set and
search is always global — there's no real "home" and no way to scope search to the
current set. This adds a **search-first Home** with recent searches + recently viewed
cards, **set-scoped search** with an all-sets toggle, a **filter menu** behind a button,
and two small cleanups (toolbar set-name, sidebar year).

Zustand is already the state layer (5 slices persisted to IndexedDB via `idb-storage`).
Recents are new lightweight UI state → a **separate Zustand store persisted to
localStorage** (Zustand `persist` middleware), keeping them out of the domain store.

## Decisions

| # | Item | Decision |
|---|------|----------|
| 1 | Toolbar | Remove the current-set name/logo block; move set identity to the content header |
| 2 | Sidebar | Show each series' earliest release **year** next to the name |
| 3 | Home | **Search-first** landing (logo + big search) + **recent searches** + **recently viewed cards**; shown when no set is selected and no query |
| 4 | Search scope | In a set: default to **that set**, with a `This set / All sets` toggle. On Home: global |
| 5 | Filters | A **Filter button** right of the search input (active-count badge) opens the filter menu, replacing the always-visible popovers |
| 6 | State | New `useRecentsStore` (Zustand `persist` → localStorage) for recents |

## Design

### Recents store (`src/store/recents.ts`)

A standalone Zustand store with the `persist` middleware + `createJSONStorage(() => localStorage)`,
storage key `ptcgv-recents`. Kept separate from the IDB domain store.

```ts
interface RecentsState {
  recentSearches: string[];                 // newest-first, deduped, cap 10
  recentlyViewed: HoloCardData[];           // newest-first, deduped by id, cap 24
  addRecentSearch: (q: string) => void;     // trims; ignores empty; moves dupes to front
  addRecentlyViewed: (card: HoloCardData) => void; // dedupe by id, move to front
  clearRecentSearches: () => void;
}
```

- `addRecentSearch`: trim; no-op on empty; remove existing equal entry then unshift; slice(0,10).
- `addRecentlyViewed`: remove existing by `id` then unshift; slice(0,24).
- Persisted shape = the two arrays only (actions are not serialized).

### Home (`src/pages/home.tsx`)

Rendered by `BrowsePage` when `!setId && !query` (the auto-newest-set effect is removed;
`pickNewestSetId` is no longer used for defaulting — Home is the default landing).

Layout (centered, max-width column):
- App logo (larger) + a prominent search input — same behavior as the toolbar/SearchBar
  input (debounced, species autocomplete). Submitting sets `?q=…` → global search results.
- **Recent searches**: a chip row (from `recentSearches`); click re-runs (`?q=chip`). A small
  "Clear" affordance calls `clearRecentSearches`. Hidden when empty.
- **Recently viewed**: a `HoloCard` row (from `recentlyViewed`); click → `/card/:id`. Hidden
  when empty.
- First-visit empty state: logo + search + a one-line hint ("Search a card or pick a set").

Reached anytime via the toolbar logo (`Link to="/"`), which carries no `setId`/`q`.

The search input core (debounce + autocomplete) is shared between Home and the in-set
SearchBar — extract a `useCardSearchBox` hook or a shared `<SearchInput>` so the logic isn't
duplicated.

### Search scope (`scope` URL param)

- New URL param `scope` (`useScopeParam` in `use-url-selection.ts`): values `set` (default)
  | `all`. Absent → `set`.
- `BrowsePage` fetcher resolution:
  - No set selected (Home dismissed by a query) → global name search (`getCardsByName`).
  - Set selected, no query → that set's cards (`getCardsBySet`).
  - Set selected + query + scope=`set` → **set-scoped name search**.
  - Set selected + query + scope=`all` → global name search.
- Set-scoped name search: extend the API to query `set.id:{id} name:"*{escaped q}*"` plus the
  existing filter clauses. Implement by adding an optional `name` to the set query path (reuse
  `buildFilterClauses` + `escapeLucene`), e.g. `getCardsBySet(setId, page, size, filters, name?)`.
- `cacheKey` must include scope + query + set + filters so cached results don't collide.
- The `This set / All sets` toggle (segmented control) renders next to the search input **only
  when a set is selected**; it writes `scope`.

### Filter menu (`src/components/search-bar/`)

Replace the always-visible `FilterPopover` row with:
- A `Filter` button immediately right of the search input, showing an active-count badge
  (total selected across the 4 dimensions). Reuse a `Popover`/panel anchored to the button.
- Inside the panel: the four dimensions (Type/Rarity/Supertype/Subtype) as multi-selects +
  "Clear all". Keep `useFilterParam` (URL) + `useFilterValues` (live API values) +
  `buildFilterClauses` mechanics unchanged.

### Toolbar (`src/components/app-shell/toolbar.tsx`)

Remove the `currentSet` logo/name/count block. Toolbar = logo (home link) · Open Packs
(disabled when no set) · Collection · offline/install. Set identity now lives in the content
header.

### Content header (`BrowsePage`, set view)

Above the grid in the set view: set logo + name + series + total count + the loaded count.
(Replaces the bare "Browse set · N loaded".) Search-results view keeps a results header.

### Sidebar year (`series-sidebar-item.tsx`)

Show each series' **earliest release year** next to the series name. Derive from the series'
sets (`min` of `releaseDate` years) — compute in `group-sets-by-series` (add a `year` to
`SeriesGroup`) or in the item. Row: `{series} · {year}` … `{count}`.

### Recently-viewed capture

`CardDialog` calls `addRecentlyViewed(card)` on mount (after the loader resolves), storing the
`HoloCardData`-shaped subset it already builds (`toHoloCardData`).

### Recent-search capture

The search box commit (in the shared search hook) calls `addRecentSearch(q)` when a non-empty
query is committed.

## File plan

**New**
- `src/store/recents.ts` (+ `recents.test.ts`)
- `src/pages/home.tsx`
- `src/components/search-bar/search-input.tsx` (or a `useCardSearchBox` hook) — shared input core
- `src/components/search-bar/scope-toggle.tsx`
- `src/components/search-bar/filter-menu.tsx` (button + panel wrapping the dimensions)

**Modified**
- `src/hooks/use-url-selection.ts` (+ `useScopeParam`)
- `src/pages/browse-page.tsx` (Home branch, scope-aware fetcher + cacheKey, content header)
- `src/components/search-bar/search-bar.tsx` (use shared input; filter button; scope toggle)
- `src/api.ts` (set-scoped name search)
- `src/components/app-shell/toolbar.tsx` (remove set block)
- `src/components/series-sidebar/series-sidebar-item.tsx` (year)
- `src/utils/group-sets-by-series.ts` (expose earliest year) + test
- `src/components/card-dialog/card-dialog.tsx` (record recently viewed)

**Possibly removed**
- `src/utils/pick-newest-set.ts` + test — no longer used for defaulting (verify no other callers;
  delete if orphaned).

## Testing

- TDD: `recents` store (dedupe, caps, empty/whitespace ignore), set-scoped query builder,
  `group-sets-by-series` year derivation, `useScopeParam` parsing.
- Visual-verify (preview): Home (empty + with recents), in-set search + scope toggle, filter
  menu open/badge, toolbar without set name, sidebar years.

## Risks / notes

- Search-first Home means first visit shows no cards — intended (it's a landing).
- localStorage persist: hydration is synchronous; recents render immediately. Guard against
  malformed stored JSON (Zustand persist handles version/migrate; keep shape minimal).
- `recentlyViewed` stores card image URLs (small metadata) — well within localStorage limits at
  cap 24.
- Removing the auto-newest-select changes first-load behavior (lands on Home, not a set).

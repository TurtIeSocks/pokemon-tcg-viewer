# Feature Parity Restore — Design Spec

**Status:** Approved (delegate mode, 2026-05-31)
**Base:** `migrate/tanstack-start` (the SSR migration)
**Goal:** Restore full feature parity with the pre-migration `main` SPA on the new TanStack Start SSR base, rebuilding interactive surfaces as client islands.

---

## Problem

The SSR migration (Plans 01–08) shipped a correct, crawlable server-rendered spine but left the **interactive layer half-built**, in two failure classes:

- **(A) Stubbed islands.** Plan 05 wrapped some surfaces in `<ClientOnly>` but left the SSR *fallback* markup (plain `<li><img>`) as the only client render — never building the real interactive component. Affected: search results, set/search filters, sidebar.
- **(B) Deleted-as-orphan features.** Plan 07's deletion used "0 live importers = dead code." Correct for leaf utilities; wrong for **feature components** that had 0 importers *only because Plans 03–06 never re-wired them as islands*. They were unmigrated, not dead. Deleted: pack opening, timeline view, cross-links, price display, scope toggle, type colors, mobile sidebar sheet, about/repo.

## Audit findings (vs `main`)

User-reported + audit-found, all confirmed in code:

| # | Gap | Root cause | Class |
|---|-----|-----------|-------|
| 1 | Series not collapsible | `sidebar-nav.tsx` renders all expanded, no `Collapsible` | A |
| 2 | Search results: no hover, no click, no infinite scroll | `corpus-search-island.tsx` renders plain `<li><img>`; loader page-1-only (40 cap); no `endReached` | A |
| 3 | Set page lost its search bar | `SetPage` renders no search input | A |
| 4 | Filter pills not clickable | facets are plain `<span>`, no state/wiring | A |
| 5 | Card dialog text out of bounds | `max-w-3xl` + `size="focus"` (~734px) image col overflows; meta clips | A |
| 6 | No add-to-collection in dialog | `card-modal.tsx` has 0 `CollectionToggle` | A/B |
| 7 | Open-Packs gone | `pack-dialog`/`roll-pack`/`pack-cards-slice` deleted | B |
| 8 | Sets not prerendered | `vite.config.ts` filter `segments.length <= 1` excludes set paths | config |
| 9 | Live prices gone | `price-lines.ts` deleted; data still fetched, unrendered | B |
| 10 | Cross-links gone | `cross-link-overlay` deleted; `/pokemon/{name}` page has no inbound links | B |
| 11 | Timeline/lineage view gone | `pokemon-timeline` + `view-mode-toggle` + `group-cards-by-era` deleted | B |
| 12 | Scope toggle (this-set vs all) gone | `scope-toggle` deleted | B |
| 13 | Mobile nav, About, repo link gone | `app-toolbar.tsx` dropped `Sheet`/`AboutDialog`/`RepoLink` | B |

**Note on #2's "20":** the SSR loader caps at 40 (`fetchCardsByName(q,1,40)`), rendered as a 5×8 grid. The bug is the absence of pagination past page 1, not a wrong cap.

## Keystone enabler

`makeCorpusFetcher` (`src/store/corpus/corpus-runtime.ts:109`) already does paginated, filtered, set/dex/name-scoped queries against the in-memory corpus: `CorpusQuery = { query?, setId?, dexNumber?, filters?, relevance }`, returns `cards.slice((page-1)*pageSize, …)` + true `totalCount`. So **one** client grid island wired to it fixes #2, #3, #4, and infinite scroll together. The corpus carries every rarity/type/subtype, so global filter options derive client-side (no API filter-value endpoints to restore).

---

## Architecture — 4 island groups + 2 config/data fixes

### Group 1 — Unified card-grid + controls island *(keystone)*
- **`CardGridIsland`** — single Virtuoso grid of `HoloCardIsland`s. Each cell: hover foil ✓, `<Link>` to card route ✓, `CollectionToggle` + `CrossLinkOverlay` overlay. `endReached` → next corpus page ✓ (fixes count/render mismatch — header reads corpus `totalCount`, the paginable truth). Driven by a `CorpusQuery` built from URL search params.
- **`SearchControls`** — name input + 4 filter dropdowns (`supertype/subtype/rarity/type`) + scope toggle (`ScopeToggle`, shown when a set is in context). Writes `q/types/rarity/supertype/subtypes/scope` to URL search params; grid reads them.
- Consumers: **set page** (search bar restored, options from SSR `facets`), **search page** (replaces stub, options corpus-global), **pokemon page**, **collection**.
- Fixes #2, #3, #4.

### Group 2 — Card detail parity
- Expand `CardMeta` → full focus view ported from `main` card-dialog: type pills (`card-colors.getTypeColor`), abilities, attacks, weaknesses/resistances/retreat, rules, **price lines** (`price-lines.buildPriceLines`), set/flavor/artist.
- **`CollectionToggle`** in modal (#6).
- Overflow fix: constrain focus-card column width (`max-w-[300px]`), `min-w-0` + `overflow-y-auto` meta col (#5).
- **`CrossLinkOverlay`** restored → links to `/pokemon/{name}` (dex→name resolved server-side in `$card` loader via existing `nameByDex` + pokémon list, passed as loader data) and `/{series}/{set}`. Wires inbound traffic to the orphaned `/pokemon/{name}` SEO page (#10).
- Tilt-to-shine button ported.
- Fixes #5, #6, #9, #10.

### Group 3 — Sidebar collapse + toolbar parity
- **`SidebarNav` collapse:** series rows wrapped in `ui/collapsible` as a client island; default-collapse non-active series. SSR fallback stays all-expanded (crawlable). #1.
- **Toolbar:** restore mobile `Sheet` (hamburger → sidebar — mobile currently has no nav), `AboutDialog`, `RepoLink`, and an **Open Packs** button. #13.

### Group 4 — Pack opening
- Restore pure `roll-pack.ts` + `pack-cards-slice` (cache) verbatim.
- Pack-open as a **client dialog** (not a route — RNG content, nothing to prerender/crawl/deep-link), triggered from toolbar + set page. #7.

### Group 5 — Timeline / view-mode
- Restore `pokemon-timeline/*` (incl. `group-cards-by-era`) + `view-mode-toggle` as a grid↔timeline toggle island on the search + pokemon pages. View mode in a URL param. #11, #12 (scope toggle lands in Group 1).

### Config/data fixes
- **Prerender sets:** `vite.config.ts` prerender filter `<= 1` → `<= 2` (~165 set pages prerendered at build; sets change ~monthly). #8.

---

## Decomposition → implementation plans

Each is independently mergeable and produces working software.

1. **Plan 09 — Unified grid + controls island** (Group 1). The keystone; do first.
2. **Plan 10 — Card detail parity** (Group 2).
3. **Plan 11 — Sidebar collapse + toolbar + prerender sets** (Group 3 + config).
4. **Plan 12 — Pack opening** (Group 4).
5. **Plan 13 — Timeline / view-mode** (Group 5).

## Assumptions (delegate-mode decisions)

1. **Filter/search/view/scope state = URL search params** (not client-only). Shareable, SSR-readable, SEO-able. Matches `main`.
2. **One unified `CardGridIsland`**, not per-page grids. DRY; all list pages converge on it.
3. **Pack opening = client dialog, no route.** RNG content can't prerender and deep-linking adds nothing. Departs from `main`'s `/pack/{setId}` URL.
4. **Global filter options derived from the corpus client-side.** Don't restore API `getTypes/getRarities/getSubtypes/getSupertypes` endpoints — the corpus has the values.
5. **Cross-link dex→name resolved server-side** in the `$card` loader (existing `nameByDex` + pokémon list), passed as loader data. No client pokémon-list fetch.
6. **Restore `card-colors.ts`, `price-lines.ts`, `roll-pack.ts`, `pokemon-timeline/*`, `group-cards-by-era.ts` ~verbatim** from `main` (pure/presentational; only import paths change — e.g. `react-router` `Link` → `@tanstack/react-router`, `../api` types → `../server/card-mappers`).
7. **Timeline is IN scope** (Plan 13) — full parity, not a cut line.
8. **`useCards`-style client pagination not revived** — `makeCorpusFetcher` already paginates; the grid calls it directly via `endReached`.
9. **Hydration discipline preserved** — every restored interactive surface is a `<ClientOnly>` island (or guarded), SSR fallback mirrors crawlable content. No SEO regression, no hydration mismatch (the Plan 05 invariant).

## Testing

- Pure restored logic (`roll-pack`, `price-lines`, `card-colors`, `group-cards-by-era`) keeps/ports its `main` unit tests.
- Island render tests follow the established `bun test` + happy-dom + `renderInRouter` pattern (Plans 03/05/06).
- Per-plan verification gate: typecheck + lint + `bun test` + `bun run build` + per-route curl (SSR fallback still contains crawlable card names/images/links).

## Non-goals

- PWA / offline (separately deferred; `install-prompt`/`offline-indicator` stay deleted).
- New features beyond `main` parity.
- CF Worker absorption.

# Design Revamp — shadcn/ui + Tailwind migration & unified shell

- **Date:** 2026-05-30
- **Branch:** `design-revamp`
- **Status:** Approved (brainstorming complete; ready for implementation planning)

## Context

A design service produced an alternative UI (`design-ref/`, a Next.js app) with a cleaner
aesthetic and more room to grow. We want to adopt its **design concepts** — top toolbar,
left sidebar, search + filters, click-to-open card dialog — onto our existing **Vite + React
Router 7** app, while keeping everything that makes ours better (holo card system, worker-proxied
API, URL-driven state, infinite scroll, Zustand+IndexedDB persistence, Pokémon-specific
navigation).

`design-ref/` is a **reference only**. It is untracked, must **never be committed**, and is
deleted once the migration lands.

## Goals

- Stand up **shadcn/ui + Tailwind v4** in the Vite app, using the latest component versions and
  the unified **`radix-ui`** package (not the individual `@radix-ui/react-*` deps `design-ref`
  lists).
- Adopt `design-ref`'s layout concepts: persistent **toolbar**, **left sidebar** (series → sets),
  **search + filters**, and **click-a-card → dialog** detail view.
- Collapse our two browse routes into one **unified single-page shell** while preserving
  URL-shareable state and the back button.
- Re-skin with Tailwind theming (inline classes prioritized over CSS files), retuned to our
  deep-purple brand.
- Merge API/helper code: keep ours where better, borrow theirs where better.

## Non-goals (explicitly dropped from `design-ref`)

- **Next.js** — stay on Vite.
- **Pagination** — keep our `react-virtuoso` infinite scroll.
- **"All Cards" browse option** — default to the **newest set** instead.
- **Their pack-opening logic** (`simulatePackOpening`) — it is buggy; keep ours (`rollPack`).
  Also drop their "pick which pack" dialog — the pack modal always opens the **currently
  selected set**.
- **Their plain card hover** — keep our specialized holo CSS effects.
- **`collection-context`** — keep our Zustand + IndexedDB collection store.
- **~50 unused shadcn `ui/` components** — install only the ones we use.

---

## Decisions ledger (locked during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Shell architecture | **Unified single page** (toolbar + sidebar + main + dialog outlet), URL-driven state preserved |
| 2 | Card detail | **Rich dialog, route-as-modal** — design-ref's 2-col layout + our richer content; `/card/:id` kept deep-linkable (loader + prefetch + error page) |
| 3 | Theme | **Deep-purple brand** hues on design-ref's token structure; **dark-only** |
| 4 | Pokémon extras | **Keep all, integrated** — species autocomplete, pokedex cross-links, era timeline |
| 5 | Pack opening | **Route-as-modal** (`/pack/:setId`); opens **selected set only**, no picker; our `rollPack` |
| 6 | Collection | **Stays a full route** (distinct browsing surface, not an ephemeral action) |
| 7 | Search scope (Phase 1) | **Name-led** (`getCardsByName`) + species autocomplete, unchanged behavior |
| 8 | Search perf (Phase 2) | **Client-side prefetched search index** — deferred, documented below |

---

## Architecture

### Shell & layout (`RootLayout`)

A single persistent layout wraps every route:

```
┌────────────────────────────────────────────────────────┐
│ Toolbar: logo · set context · Open Packs · Collection ·  │
│          offline indicator · install · (mobile ☰)        │
├──────────┬─────────────────────────────────────────────┤
│ Sidebar  │ Main:                                         │
│ series → │   search + species autocomplete + filters     │
│   sets   │   set/search context header                   │
│ (newest  │   ONE VirtuosoGrid (infinite scroll)          │
│  set     │   loading pill                                │
│  default)│   [grid/timeline toggle in search mode]       │
└──────────┴─────────────────────────────────────────────┘
        + dialog layer (card / pack) rendered over main
```

- **Toolbar** replaces `header.tsx` + `root-layout.tsx`'s `primary-nav`. Holds: logo/title;
  current-set context (logo + name + counts when a set is selected); **Open Packs** button
  (→ pack modal for `selectedSetId`); **Collection** link; our `OfflineIndicator` + `InstallPrompt`;
  a mobile sidebar toggle.
- **Sidebar** replaces the horizontal `SeriesMenu` (currently a top row of hover popovers).
  New vertical pattern from `design-ref`'s `SeriesNavigator`: each **series** is an expandable
  row revealing its **sets**. The series containing the selected set is auto-expanded on load.
  **No "All Cards" entry.** Set rows show a **consistently sized** set symbol (fix the
  `width={20} height={20}` + `className="w-auto h-auto"` bug → fixed 20px box, `object-contain`).
  On mobile the sidebar is a shadcn `Sheet` (slide-in), toggled from the toolbar.

### Routing (`src/main.tsx`)

| Path | Renders | Notes |
|------|---------|-------|
| `/` | `BrowsePage` | Merges `SetsPage` + `PokemonPage`. URL params drive everything. |
| `/collection` | `CollectionPage` | Kept as-is (full route). |
| `/card/:id` | `BrowsePage` (bg) + `CardDialog` | **Route-as-modal.** Keeps `cardLoader`, `errorElement`, prefetch. |
| `/pack/:setId` | `BrowsePage` (bg) + `PackDialog` | **Route-as-modal.** Reuses `pack-cards-slice` + `rollPack` + `BoosterPack`. |
| `/holo-debug` | `HoloDebugPage` | Dev-only, unchanged. |
| ~~`/pokemon`~~ | — | **Removed**, folded into `/`. |

**`BrowsePage` URL contract** (all via existing `use-url-selection` hooks):
- `setId` → show that set's cards (`getCardsBySet`).
- `q` → name search (`getCardsByName`), **overrides** set selection.
- `types` / `rarity` / `supertype` / `subtypes` → filter clauses (`buildFilterClauses`).
- `view` → `grid` (default) | `timeline` (search mode only).

Selecting a set sets `setId` and clears `q`; typing a search sets `q`; clearing `q` returns to the
selected set. The existing `useCards` SWR hook + cache-key composition is reused unchanged.

**Route-as-modal implementation note (risk):** React Router 7 uses a data router
(`createBrowserRouter`), so the classic `<Routes location={background}>` trick does not apply
directly. Approach: navigate to the modal route with `state: { background: <current location> }`;
the layout renders the dialog over the kept browse view. If keeping `BrowsePage` mounted proves
awkward, an acceptable fallback is letting it remount — browse data lives in the Zustand
`cardsCache` (instant) and `ScrollRestoration` restores scroll, so a remount is cheap. Final
mechanism is decided in the implementation plan.

### Newest-set default

`getSets()` currently orders `releaseDate` **ascending** (`sets[0]` = oldest). The unified shell
must default to the **newest** set: select the set with the max `releaseDate` when no `setId` is
present (replacing `SetsPage`'s current `sets[0]` fallback). Sidebar ordering is unaffected.

---

## Component migration

### Search + filters (`src/components/search-bar/`, new)

- **Search input**: shadcn `Input`, debounced (reuse `card-search.tsx`'s debounce/commit logic),
  writes the `q` param. **Species autocomplete** folded in (port `pokemon-filter.tsx`'s
  match/keyboard UX, likely via shadcn `Command`); selecting a species drives a name search.
- **Filters**: re-skinned with shadcn primitives (Popover/Select/Badge), but **mechanics
  unchanged** — `useFilterParam` (URL state), `useFilterValues` (live API values from
  `getTypes`/`getRarities`/`getSupertypes`/`getSubtypes`), `buildFilterClauses` (Lucene). Keeps
  multi-select per dimension + "Clear filters". Replaces `filter-chip-row/`.

### Grid (`src/components/card-grid.tsx`, light edit)

- **`VirtuosoGrid` + `HoloCard` unchanged.** Restyle the container/spacing with Tailwind.
- `hoverOverlay` (cross-links + collection toggle) preserved.
- Card click → navigate to `/card/:id` **with `state.background`** so it opens as a modal
  (instead of today's plain `navigate('/card/'+id)`).
- **Grid/timeline toggle** (`view-mode-toggle/` + `pokemon-timeline/`) kept for search mode.
- **Pokedex cross-links** kept; targets change `/pokemon?q=…` → `/?q=…`; set links stay `/?setId=…`.

### Card dialog (`src/components/card-dialog/`, new — replaces `pages/card-page.tsx`)

- shadcn `Dialog`. **2-col layout** from `design-ref`'s `CardDetailModal`.
- **Left:** interactive `HoloCard size="focus"` with the holo + **tilt** toggle (port from
  `card-page.tsx`).
- **Right (our richer content):** name / HP / types, abilities, attacks, weakness / resistance /
  retreat, rules, flavor, artist, set info, rarity, **TCGPlayer + Cardmarket pricing**
  (`buildPriceLines`), **pokedex cross-links**, collection toggle.
- Data via our `getCardById` → `FocusCardData` (keep the `cardLoader`).
- Type/rarity badge colors via **borrowed** `getTypeColor` / `getRarityColor`.
- Close → navigate back to the background location.

### Pack dialog (`src/components/pack-dialog/`, new — replaces `pages/pack-page.tsx`)

- shadcn `Dialog`, opened for **`selectedSetId` only** (no picker).
- Reuses `loadPackCards` (`pack-cards-slice`), `BoosterPack` (tap-to-rip), and `rollPack`
  (1 rare / 3 uncommon / 6 common, no dupes, top-up) **verbatim** — just rehoused from a full
  page into the dialog.
- Flow: rip → reveal 10 `HoloCard`s in a **scrollable** grid → "Open another pack" rerolls in
  place. Revealed card click → card dialog.

### Collection (`src/pages/collection-page.tsx`, re-skin only)

Stays a full route; re-skinned with Tailwind/shadcn. Continues to use the Zustand `collection-slice`
+ IndexedDB.

---

## Theme & tooling

### Build setup

- Add **Tailwind v4** via the `@tailwindcss/vite` plugin in `vite.config.ts` (not PostCSS/Next).
- Run **`shadcn@latest init`** configured for Vite: `style: new-york`, `rsc: false`, `tsx: true`,
  baseColor `neutral`, css = `src/app.css`, aliases under `@/`. Generates `src/lib/utils.ts`
  (`cn`).
- Add **`@/*` → `src/*`** alias in `tsconfig.app.json` (`paths`) and `vite.config.ts`
  (`resolve.alias`).
- New deps: `tailwindcss`, `@tailwindcss/vite`, `radix-ui` (unified), `class-variance-authority`,
  `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`.
- **Install only used shadcn components** (initial set): `button`, `input`, `dialog`,
  `dropdown-menu`, `popover`, `select`, `badge`, `scroll-area`, `separator`, `sheet`, `skeleton`,
  `tooltip`, `command`, `collapsible`. Patch any that import individual `@radix-ui/react-*` to use
  the unified `radix-ui` package.

### Theme tokens

- Port `design-ref`'s `@theme inline` + `:root` token **structure** (`--background`, `--card`,
  `--primary`, `--accent`, `--sidebar*`, `--radius: 0.75rem`, oklch) into `src/app.css`.
- **Retune base hues to our deep-purple brand** (bg `#0f0823` family, lighter purple surfaces,
  vibrant violet primary, holo-cyan/gold accent). Dark-only (no light variant).
- **Prioritize inline Tailwind classes.** Migrate component CSS (`header.css`, `card-search.css`,
  `pokemon-filter.css`, `filter-chip-row.css`, `series-menu.css`, etc.) to inline classes.
- **Holo CSS is exempt and stays as CSS files** (`holo-card/holo-card.css`,
  `holo-card/rarity-styles.css`): keyframes + `data-rarity`/`data-subtypes` clip-path selectors
  can't be expressed as inline utilities. Do not touch the holo system's internals.

### API merge (`src/api.ts`)

- **Keep ours wholesale:** worker-proxy base resolution (`VITE_API_BASE` + origin fallback),
  server-side key injection, `select=` payload trimming, Lucene builders (`buildFilterClauses`,
  `escapeLucene`), `getSets`, `getCardsBySet`, `getCardsByName`, `getCardsByPokedexNumber`, live
  filter-value endpoints, `getCardById` (`FocusCardData`).
- **Borrow only** `design-ref`'s pure presentation helpers `getTypeColor(type)` and
  `getRarityColor(rarity)` (for the new type/rarity badges).
- **Drop** `design-ref`'s `fetchCards` / `globalSearch` / `simulatePackOpening` / direct-API base /
  pagination types.
- **Worker unchanged in Phase 1.** It already edge-caches `/v2/*` via `caches.default` with sorted
  param keys, key injection, and SWR (`s-maxage=3600, stale-while-revalidate=86400`). No changes
  needed for this migration.

---

## File plan

**New**
- `src/lib/utils.ts` (shadcn `cn`)
- `src/components/ui/*` (installed shadcn components)
- `src/components/app-shell/toolbar.tsx`
- `src/components/series-sidebar/*` (vertical series → sets navigator)
- `src/components/search-bar/*` (search input + species autocomplete + filters)
- `src/components/card-dialog/*`
- `src/components/pack-dialog/*`
- `src/pages/browse-page.tsx` (merges `sets-page` + `pokemon-page`)

**Modified**
- `src/main.tsx` (route table; route-as-modal wiring)
- `src/root-layout.tsx` (becomes the shell: toolbar + sidebar + outlet + dialog layer)
- `vite.config.ts` (Tailwind plugin + `@/` alias)
- `tsconfig.app.json` (`paths`)
- `src/api.ts` (+ borrowed color helpers)
- `src/app.css` (Tailwind import + theme tokens)
- `src/components/card-grid.tsx` (click → modal via `state.background`)
- cross-link targets (`/pokemon?q=` → `/?q=`)

**Removed / migrated**
- `src/pages/card-page.tsx` (+ `.css`) → `card-dialog/`
- `src/pages/pack-page.tsx` (+ `.css`) → `pack-dialog/` (logic reused from `roll-pack`/`booster-pack`/slice)
- `src/pages/sets-page.tsx`, `src/pages/pokemon-page.tsx` → `browse-page.tsx`
- `src/components/header.tsx` (+ `.css`)
- `src/components/series-menu/*`
- `src/components/filter-chip-row/*` (re-skinned into `search-bar/`)
- Component `.css` files migrated to inline Tailwind (holo CSS exempt)

**Preserved untouched (load-bearing)**
- `src/components/holo-card/*` (entire holo system)
- `src/store/*` (Zustand slices, IndexedDB, freshness/SWR)
- `src/hooks/*` (`use-cards`, `use-sets`, `use-pokemon-list`, `use-filter-values`,
  `use-url-selection`)
- `src/utils/*` (`roll-pack`, `build-filter-clauses`, `escape-lucene`, `group-sets-by-series`,
  `pokemon-name`, `display-name`)
- `src/components/{booster-pack,pokemon-timeline,view-mode-toggle,cross-link-overlay,collection-toggle,install-prompt,offline-indicator}`
  (re-skinned as needed; logic intact)
- PWA config in `vite.config.ts`

**Deleted at the end** — `design-ref/` (never committed).

---

## Phasing

1. **Tooling + theme**: Tailwind v4 plugin, `shadcn init`, `@/` alias, theme tokens, install
   component set, `cn`. App still renders old UI; verify build + dev server.
2. **Shell**: toolbar + vertical sidebar + unified `BrowsePage` (merge sets/pokemon) + routing
   (drop `/pokemon`, newest-set default). Verify browse + search + filters + infinite scroll.
3. **Card dialog**: route-as-modal `/card/:id`, rich 2-col content, holo+tilt, pricing,
   cross-links. Verify deep-link + grid-click + back button.
4. **Pack dialog**: route-as-modal `/pack/:setId`, selected-set-only, reuse roll logic. Verify
   rip → reveal → reroll.
5. **Cleanup**: migrate remaining component CSS → inline Tailwind, re-skin collection, delete
   `design-ref/`, final lint/typecheck/test + visual verification.

Each phase visually verified via the `preview` config (port 4173, base `/pokemon-tcg-viewer/`).

## Testing & verification

- Preserve existing tests for untouched logic (holo, store, utils, hooks). Update tests for moved
  components (card-page → card-dialog, pack-page → pack-dialog, sets/pokemon → browse).
- TDD any new logic (newest-set selection, route-as-modal background handling, search/filter
  composition in `BrowsePage`).
- Run lint + typecheck + tests at phase boundaries (not per-step). Browser-provider suites at end
  of each TDD task.
- Visual-verify each phase in the browser preview (grid paints via IndexedDB-backed cache).

---

## Phase 2 (deferred — documented, not built now)

**Client-side prefetched search index.** pokemontcg.io is slow for free-text search because
novel terms always cold-miss the edge cache and leading-wildcard scans are expensive at origin.

Plan: background-prefetch a compact index of all cards (`id`, `name`, `set`, `artist`, …) via
paginated `select=` calls, persist in IndexedDB, and search **locally** — instant, offline-capable,
infix + multi-field matching for free, zero origin dependency for matching. Full card records are
fetched only for visible matches. This also unlocks `design-ref`'s multi-field search (name / set /
series / artist / flavor) without the latency penalty. Scoped as its own project (index build,
storage, refresh/sync strategy) after the design revamp lands.

## Open risks

- **Route-as-modal in a data router** — needs the `state.background` technique; remount fallback
  is acceptable given store-backed browse state (see routing note above).
- **shadcn generated `ui/` files** use `type` aliases and generated patterns that conflict with the
  project's `interface`-over-`type` Biome preference — treat `src/components/ui/**` as generated
  and exempt from that rule.
- **CSS → inline Tailwind churn** is broad; do it incrementally per phase, holo CSS exempt.

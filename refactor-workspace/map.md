# Refactor Map — Vite SPA → TanStack Start

Primary deliverable. New structure + per-leaf `← was` / `Action` / `Notes`. Cites `tanstack-start-best-practices` rule ids where they apply.

**Action vocabulary:** port | port+redesign | split | merge | rewrite | drop | replace-with-loader | new.

---

## New structure

```
src/
  router.tsx                         ← new (TanStack Router instance + context)
  routes/
    __root.tsx                       ← was root-layout.tsx + main.tsx shell
    index.tsx                        ← was pages/home.tsx
    search.tsx                       ← was browse-page.tsx (by-name mode)
    pokemon/
      $name.tsx                      ← was browse-page.tsx (by-dex mode)
    $series/
      route.tsx                      ← new (series layout)
      index.tsx                      ← was series-sidebar grouping → sets-as-packs
      $set/
        route.tsx                    ← new (set layout: search bar + per-set facets)
        index.tsx                    ← was browse-page.tsx (by-set mode)
        $card.tsx                    ← was main.tsx `card/:id` + card-loader.ts
    collection.tsx                   ← was pages/collection-page.tsx
    holo-debug.tsx                   ← was pages/holo-debug-page.tsx (DEV gate)
  server/
    card-data.ts                     ← was api.ts fetch fns (now server-side)
    cache-headers.ts                 ← new (Cache-Control SWR helper)
  lib/
    slug.ts                          ← new (slug↔id map + slugify/resolve)
  components/   (mostly unchanged — now islands)
  store/        (client-only persist — collection / recents / corpus / nav cache)
  utils/        (kept, pure)
```

---

## Routes — per-leaf

### `routes/__root.tsx`  ← `root-layout.tsx` + `main.tsx`
- **Action:** rewrite (merge)
- **Notes:** Replaces `createBrowserRouter`. Renders Toolbar + `SeriesSidebar` + `<Outlet/>`. **Root loader** returns the series list (grouped from sets). `ssr-prerender`: series list is **prerendered** (rebuild monthly). Corpus kickoff (`requestIdleCallback → loadCorpus`) stays in a client `useEffect` — never on server (`ssr-hydration-safety`). Drop `basename` (served at root, not `/pokemon-tcg-viewer/`).

### `routes/index.tsx`  ← `pages/home.tsx`
- **Action:** port+redesign
- **Notes:** Static SSR shell (search bar, hero). The "recent searches / recently viewed" block becomes a **client island** reading `useRecentsStore` (localStorage) — renders empty on server, hydrates on client. `ssr-hydration-safety`.

### `routes/$series/route.tsx` + `index.tsx`  ← `series-sidebar` grouping
- **Action:** new + redesign
- **Notes:** `route.tsx` = series layout (breadcrumb/title). `index.tsx` **loader** returns the sets in this series (`getSets` filtered) → rendered as `BoosterPack` tiles linking to `/{series}/{set}`. `ssr-data-loading` (loader, not fetch-on-mount). **SSR + long SWR** headers (`cache-headers.ts`). Resolve `series` slug → name via `lib/slug.ts`.

### `routes/$series/$set/route.tsx`  ← new (set layout)
- **Action:** new
- **Notes:** Set layout owns the **search bar** + **per-set facets**. Loader computes facet options from *this set's* cards (server-side) — replaces global `use-filter-values`. Renders `<Outlet/>` for grid + card dialog.

### `routes/$series/$set/index.tsx`  ← `browse-page.tsx` (by-set mode)
- **Action:** split from mega-page
- **Notes:** **Loader** SSRs page 1 of the set's cards (`server/card-data.ts`) so cards are crawlable. Hydrates into the `CardGrid` (Virtuoso) island; `useCards` keeps client load-more/SWR seeded with loader data. `view`/filter state stays in **search params** under this path. SSR + SWR headers.

### `routes/$series/$set/$card.tsx`  ← `main.tsx card/:id` + `card-loader.ts` + `card-prefetch.ts`
- **Action:** port+redesign (the ISR target)
- **Notes:** **Loader** = `getCardById(resolve(slug))` (port `card-loader`/`card-prefetch`). Sets `<title>` + **OG meta** (`head`/meta). **SSR on-demand + SWR** `Cache-Control` (the "render once, cache till TTL"). Dialog-vs-page parity: render `CardDialog` as a modal over the set grid on client nav, full page on direct/crawler hit (TanStack modal-route pattern — resolve in plan). Live prices = **client island**, never in cache/OG. `sf-response-headers`, `err-not-found`.

### `routes/search.tsx`  ← `browse-page.tsx` (by-name mode)
- **Action:** split from mega-page
- **Notes:** `?q=` name search. Server loader can SSR first page for crawl; corpus island takes over for instant client search. Cross-set results link to `/{series}/{set}/{card}`.

### `routes/pokemon/$name.tsx`  ← `browse-page.tsx` (by-dex mode)
- **Action:** split+redesign (new SEO entity)
- **Notes:** "All {Pokémon} cards across sets." Loader by national-dex (resolve name→dex). OG meta. This is a **new crawlable entity page** (was a hidden `?dex=` mode). Cross-link overlays now target here.

### `routes/collection.tsx`  ← `pages/collection-page.tsx`
- **Action:** port → island
- **Notes:** Reads `owned` from IDB store. SSR a neutral shell; hydrate the grid client-side. `Cache-Control: private, no-store`. `ssr-hydration-safety`.

### `routes/holo-debug.tsx`  ← `pages/holo-debug-page.tsx`
- **Action:** port
- **Notes:** Keep behind a DEV-only guard.

---

## Server seam (new)

### `server/card-data.ts`  ← `api.ts` fetch functions
- **Action:** refactor (move server-side)
- **Notes:** `getSets`/`getCardsBySet`/`getCardsByName`/`getCardById`/filter lists become **server functions / loader calls**. API key from **server env** (`sec-sensitive-data`), not `VITE_API_BASE`. Keep DTO mappers (`apiCardToProps`, `apiCardToFocusProps`) verbatim. v1: may still call the CF Worker; later: call origin directly. `sf-create-server-fn`, `sf-input-validation`.

### `server/cache-headers.ts`  ← new
- **Action:** new
- **Notes:** Helper applying the `goals.md` `Cache-Control` matrix per route kind (prerender / SSR-SWR / no-store). Reuse `freshness.ts` TTLs.

### `lib/slug.ts`  ← new (data from `scripts/build-corpus.ts`)
- **Action:** new
- **Notes:** `slugify(name)`, `resolveSeries/Set/Card(slug)→id`, built from a `slug↔id` map emitted at build from the corpus. Collision → numeric disambiguator; rename → keep old slug as redirect.

---

## Bulk ports (≈1:1, become client islands — logic unchanged)

| Old | New | Notes |
|---|---|---|
| `components/holo-card/*` | same | `client:load` island; the signature effect |
| `components/card-grid.tsx` (+`.css`) | same | Virtuoso island over SSR'd HTML |
| `components/card-dialog/*` | same | + canonical route parity |
| `components/booster-pack/*` | same | `/{series}` set tiles |
| `components/pokemon-timeline/*` | same | view-mode island |
| `components/search-bar/*` | same | repoint state writes |
| `components/series-sidebar/*` | same | data from root loader; path links |
| `components/collection-toggle`, `cross-link-overlay` | same | retarget links to new paths |
| `components/app-shell/*`, `ui/*` | same | unchanged |
| `components/install-prompt`, `offline-indicator` | same | re-validate against SSR + SW |
| `store/collection-slice`, `recents`, `corpus/*`, `idb-storage`, `freshness` | same | client-only; gate off SSR |
| `store/cards-slice`, `pack-cards-slice` | same (trimmed) | client nav cache only |
| `utils/*` (`escape-lucene`, `build-filter-clauses`, `pokemon-name`, `group-sets-by-series`, `roll-pack`, …) | same | pure; reused by loaders + islands |
| `scripts/build-corpus.ts` | same + slug-map emit | extend output |
| `worker/*` | same | v1 unchanged (Defer absorb) |

## Dropped (not in new codebase)

- `pages/browse-page.tsx` — exploded into `$set/index` + `search` + `pokemon/$name`.
- `hooks/use-sets.ts`, `use-pokemon-list.ts`, `use-filter-values.ts` — replaced by loaders / per-set facets.
- `store/api-cache-slice.ts` (sets/filters/pokémonList portions) — superseded by loaders; keep only any client-nav bits still needed.
- `hooks/use-url-selection.ts` — replaced by path params + a slimmer search-param hook (`view`/`scope`/filters only).
- `main.tsx` — replaced by `router.tsx` + file routes.
- `basename` / `/pokemon-tcg-viewer/` base — gone (served at domain root).

## Open for the plan (not blockers, decide while writing the plan)

1. **Dialog↔page parity** for `$card` — exact TanStack pattern (modal via matched child route vs search-param modal).
2. **PWA/offline** under SSR — service-worker scope, navigateFallback, and whether `vite-plugin-pwa` stays or is replaced by a Nitro-served SW.
3. **Corpus on server?** — loaders could query the corpus instead of the API for SSR card lists (one data source). Decide in plan.

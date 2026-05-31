# Phase 3 — Good/Bad Assessment (bulk verdicts)

Verdict per module-group. Most presentational/interactive code is **Keep → island**; the routing + server-data seam is **Rewrite**. Tags: `[HOT]` high churn · `[CLIENT-ONLY]` SSR-unsafe · `[PURE]` no I/O.

| Module / group | Verdict | Evidence & role | Confidence |
|---|---|---|---|
| `main.tsx` | **Rewrite** | `[HOT]` 13 commits. Hand-wired `createBrowserRouter` → TanStack file-route tree + Start entry. | High |
| `root-layout.tsx` | **Rewrite** | → `__root.tsx`; sidebar data moves to root loader; corpus kickoff stays client. | High |
| `pages/browse-page.tsx` | **Rewrite + split** | The 209-LOC mega-page keys off 8 search params. Splits into `$set/index`, `/search`, `/pokemon/$name` route files. Biggest single piece of work. | High |
| `hooks/use-url-selection.ts` | **Rewrite** | search-param selection → path params (`series`/`set`/`card`) + *kept* search params (`view`/`scope`/filters). | High |
| `hooks/use-sets`, `use-pokemon-list`, `use-filter-values` | **Delete** (replace) | Client fetch-on-mount hooks → server **loaders**. Per-set facets replace `use-filter-values`. | High |
| `hooks/use-cards.ts` | **Refactor in place** | Keep client pagination/SWR/load-more; first page now hydrates from the loader instead of fetch-on-mount. | Medium |
| `api.ts` | **Refactor (split client/server)** | `[HOT]` 18 commits. Keep DTO mappers (`apiCardToProps`, `apiCardToFocusProps`). Fetch fns move server-side (key from env, not `VITE_API_BASE`). `sec-sensitive-data`. | High |
| `pages/card-loader.ts` + `card-prefetch.ts` | **Port → loader** | Near 1:1 to a TanStack route loader for `$card`. Add SWR headers + OG. | High |
| `pages/card-error-page.tsx` | **Port → errorComponent** | Maps to route `errorComponent` / `notFoundComponent`. `err-not-found`. | High |
| `pages/home.tsx` | **Refactor** | → `index.tsx` route. Static shell SSR'd; recents become a client **history island**. | High |
| `pages/collection-page.tsx` | **Keep → island route** | Reads `owned` (IDB). Shell SSR-able, data client-only, `private, no-store`. | High |
| `pages/holo-debug-page.tsx` | **Keep** | Dev-only route (`import.meta.env.DEV`). Port the gate. | High |
| `store/index.ts` (+ `idb-storage`) | **Refactor** | `[CLIENT-ONLY]` persist. Keep for client nav cache + collection; **must not run during SSR** (`ssr-hydration-safety`). Server data (sets/filters) leaves the store. | High |
| `store/collection-slice.ts` | **Keep → island** | `[CLIENT-ONLY]` Pure client domain. No server equiv. | High |
| `store/recents.ts` | **Keep → island** | `[CLIENT-ONLY]` localStorage history for home island. | High |
| `store/corpus/*` | **Keep → island** | In-memory instant search. Inherently client. Untouched logic; gate load on client. | High |
| `store/cards-slice`, `api-cache-slice`, `pack-cards-slice` | **Refactor / partial Delete** | Client nav cache survives; the "fetch + persist server data" duties move to loaders. `api-cache-slice` (sets/filters/pokémonList) largely **Deleted** in favor of loaders. | Medium |
| `store/freshness.ts` | **Keep** | `[PURE]` SWR TTL policy — reuse for loader/header revalidation windows. | High |
| `components/holo-card/*` | **Keep → island** | `[HOT]` The signature feature. Pointer/WebGL-ish, client-only; `client:load`. | High |
| `components/card-grid.tsx` | **Keep → island** | `[HOT]` Virtuoso virtual grid; SSR initial HTML + hydrate. | High |
| `components/card-dialog/*` | **Keep + add canonical route** | Dialog stays for client nav; `$card.tsx` adds the SSR page. Prices = client island. | Medium |
| `components/search-bar/*`, `pokemon-filter.tsx` | **Keep → island, repoint** | Inputs write path+search-param state; filter options now per-set. | Medium |
| `components/series-sidebar/*` | **Refactor** | Data from root loader; items link to `/{series}` paths. | High |
| `components/booster-pack/*` | **Keep** | Already-built CSS packs — the `/{series}` set tiles. | High |
| `components/pokemon-timeline/*` | **Keep → island** | View mode; `[PURE]` grouping util kept. | High |
| `components/collection-toggle`, `cross-link-overlay` | **Keep, repoint links** | Retarget cross-links to `/pokemon/{name}` + `/{series}/{set}`. | High |
| `components/app-shell/*`, `ui/*` | **Keep** | Toolbar, dialogs, shadcn primitives — port unchanged. | High |
| `components/install-prompt`, `offline-indicator` | **Keep (revisit PWA)** | PWA bits; SSR + service-worker interplay to re-validate. | Medium |
| `utils/*` | **Keep** | `[PURE]` slugify-adjacent helpers; add `lib/slug.ts`. | High |
| `worker/*` | **Keep (Defer absorb)** | v1 keeps CF Worker+R2. Absorb into Start server later. | High |
| `scripts/build-corpus.ts` | **Keep + extend** | Also emit the `slug↔id` map artifact consumed by routes/build. | High |

**Rollup:** Keep ~60% (components/utils/stores-as-islands), Refactor ~25% (api, stores, sidebar, home), Rewrite ~10% (routing core), Delete ~5% (fetch hooks superseded by loaders).

# API + Image Latency Overhaul

**Date:** 2026-05-29
**Status:** Designed
**Scope:** 3 phases (Tier 1 client-only → Tier 2 edge proxy → Tier 3 image CDN)

## Context

The viewer feels sluggish. The user attributes this to `api.pokemontcg.io` (referred to as "dev.pokemontcg.io"), whose origin is genuinely slow (1–5 s responses, occasional downtime). But most of the felt latency is self-inflicted on top of the slow origin:

| # | Cause | Evidence | Cost |
|---|-------|----------|------|
| 1 | Grid renders **large** card images | `apiCardToProps` sets `imageUrl: card.images.large` (`src/api.ts`); grid renders at `width: 300` (`src/components/card-grid.tsx`) | ~600 KB / 745 px image shown at 300 px. `small` is ~50 KB. ~10× byte + decode waste per grid card. Dominant perceived lag. |
| 2 | Service worker **off in dev** | No `devOptions.enabled` in `vite.config.ts`; Workbox SW only builds in prod | Testing on `vite dev` (:6201) gets zero runtime cache — every action hits the slow origin raw. |
| 3 | API handler is **`CacheFirst`** | `vite.config.ts` `workbox.runtimeCaching` | First hit still pays full origin latency, then serves 7-day stale with no revalidation. `StaleWhileRevalidate` serves stale instantly and refreshes in the background. |
| 4 | Grid results **not persisted** | `use-cards` cache is in-memory `useState` (`src/hooks/use-cards.ts`) | Revisit a set / pokémon next session → full refetch. `packCards` is already persisted to IDB; the grid is not. |
| 5 | **No prefetch** | Next page only fetched on `endReached`; card detail only on click (loader blocks) | Latency is fully visible, never hidden behind hover or idle time. |
| 6 | Bare `<img>` | `src/components/holo-card/holo-card.tsx` — no `loading` / `decoding` / `fetchpriority` | Off-screen large images decode eagerly and compete with visible ones. |
| 7 | Fat `select` payload | Pulls the whole `tcgplayer.prices` object per card just to read `Object.keys` for the variant flag (`src/api.ts`) | Large payload, especially the 250-card pack page. Minor. |

Deploy target is **GitHub Pages — static, no backend** (`.github/workflows/deploy.yml`). Tier 2 and Tier 3 add external infrastructure deployed *outside* the Pages action.

The user selected the full scope (Tier 1 + 2 + 3).

## Goals

1. **Cut grid image weight ~10×** — serve appropriately-sized images, WebP where possible, lazy off-screen.
2. **Make revisits instant** — persist grid pages to IDB and serve stale-while-revalidate.
3. **Hide click latency** — prefetch card detail + focus image on hover/focus.
4. **Fix the dead dev cache** — service worker active in `vite dev`, or a documented `vite preview` path.
5. **Fix cold first-load at the source** — shared edge cache in front of the slow origin (Tier 2).
6. **Remove the API key from the client bundle** — move it to a server-side secret (Tier 2). Security fix, not just latency.
7. **Ship Tier 1 independently** — it is valuable and deployable to Pages with no infra; Tiers 2/3 layer on after.

## Non-goals (deferred)

- Server-side rendering / prerendering of card data.
- Wiring the Cloudflare Worker or wsrv.nl into the GitHub Actions pipeline (Worker deployed manually via `wrangler deploy`).
- Migrating off GitHub Pages.
- Replacing the slow origin with a self-hosted card dataset / mirror.
- Per-page diffing of cached grid pages (we cache the accumulated list per key and revalidate page 1 only).
- Background sync / write queue, push, periodic background fetch.
- Trimming the `select` payload (#7 above) — left as a possible later cleanup; variant detection currently depends on `tcgplayer.prices` keys.
- Cloudflare Images / any paid image service (using free wsrv.nl).
- Telemetry on cache hit rates.

## Architecture (after all three tiers)

```
Client (GitHub Pages, static)
 ├─ API calls ─► VITE_API_BASE = Cloudflare Worker ─► edge cache (SWR) ─► api.pokemontcg.io
 │                 └ X-Api-Key lives as a Worker secret (OUT of the client bundle)
 ├─ Images ─► cdnImage() ─► wsrv.nl (resize + WebP) ─► images.pokemontcg.io
 │                 └ <picture> falls back to the direct image if wsrv is down
 ├─ Service Worker (Workbox) ─► SWR for API + proxy, CacheFirst for images + wsrv, ON in dev
 ├─ Persistence (zustand + IDB) ─► now ALSO holds grid pages (SWR via freshness kind "cards")
 └─ Prefetch ─► hover warms a getCardById promise-cache + the large focus image
```

---

## Tier 1 — Client-only (zero infra, ships to Pages as-is)

### 1a. Image size split

- `HoloCardData` (`src/components/holo-card/types.ts`) gains `imageUrlSmall: string`.
- `apiCardToProps` (`src/api.ts`) fills both `imageUrl` (large) and `imageUrlSmall` (small) from `card.images`.
- Grid-context callers pass **small**: `card-grid.tsx`, `pokemon-timeline.tsx`, `pack-page.tsx`, `collection-page.tsx`.
- Focus context (`card-page.tsx`) passes **large**. Holo-debug page keeps large.
- Foil / holo overlay textures (`foil-assets.ts`) are independent of base image size — unaffected.

### 1b. `<img>` attributes

- `HoloCard` gains `priority?: boolean`.
  - `priority` (focus hero): `loading="eager"`, `fetchpriority="high"`.
  - default (grid): `loading="lazy"`, `decoding="async"`.
- Add intrinsic `width`/`height` (or CSS `aspect-ratio` if not already present) using the card ratio (≈245×342) to eliminate layout shift.

### 1c. Workbox tuning (`vite.config.ts`)

- API runtime-cache handler: `CacheFirst` → `StaleWhileRevalidate`. Keep `pokemontcg-api` name and expiry.
- Images: stay `CacheFirst` (effectively immutable).
- Add `devOptions: { enabled: true, type: "module", navigateFallback: "index.html" }` so the SW runs under `vite dev`.
  - **HMR caveat:** if SW-in-dev disrupts HMR in practice, drop `devOptions.enabled` and document `npm run preview` as the realistic-performance check instead. Decide during implementation.
- URL patterns extended in later tiers to also match the proxy origin (Tier 2) and `wsrv.nl` (Tier 3).

### 1d. Persist grid pages to IDB + SWR

- New `src/store/cards-slice.ts`, composed into the store alongside `packCards` and partialized to IDB (`src/store/index.ts`). Shape, per key (set id / pokédex number / etc.):
  ```ts
  interface CardsCacheEntry {
    cards: HoloCardData[];   // accumulated across pages
    page: number;            // highest page fetched
    totalCount: number;
    fetchedAt: number;
  }
  // state: cardsCache: Record<string, CardsCacheEntry>
  ```
- `use-cards.ts` swaps its in-memory `useState` cache for selectors/actions on this slice. Keep the existing in-flight dedup, `FETCH_THROTTLE_MS`, and resize-suppression logic.
- **SWR on mount:** render the persisted entry immediately; if `shouldRefetch({ kind: "cards", lastFetchedAt: fetchedAt })` is true, refetch page 1 in the background. If `totalCount` changed, reset that key (drop cached pages) and reload from page 1. Otherwise keep paginating from the cached length.
- **Bounded storage:** LRU cap on `cardsCache` (~50 keys); evict least-recently-accessed on insert. Each card is small after the payload trim from using `small` images in the type; ~50 keys × a few hundred cards is well within IDB.
- `src/store/freshness.ts`: add `kind: "cards"` with a 24 h TTL.

### 1e. Prefetch

- New `src/pages/card-prefetch.ts`: a module-level `Map<string, Promise<FocusCardData>>` keyed by card id, with a `prefetchCard(id)` that populates it (dedup) and a getter.
- `HoloCard` `onPointerEnter` / `onFocus` calls `prefetchCard(card.id)` **and** warms the focus image: `new Image().src = card.imageUrl` (the large URL).
- `card-loader.ts` awaits the warmed promise if present, else falls back to `getCardById`. Result: clicking a hovered card resolves instantly; the warmed fetch also primes the SW / edge cache.

### Tier 1 acceptance

- Grid network requests fetch small images (verify in Network panel); large only on focus.
- Off-screen grid images do not load until scrolled near.
- Revisiting a previously-viewed set/pokémon renders cards before any network round-trip, then quietly revalidates.
- Hovering a card then clicking shows the focus view with no visible fetch delay.
- `vite dev` (or documented `vite preview`) serves repeat API/image requests from the SW.

---

## Tier 2 — Cloudflare Worker API proxy

### Layout

- New top-level `worker/` directory (outside the Pages build): `wrangler.toml` + `src/index.ts`.
- Deployed manually with `wrangler deploy`. Documented in README. Not added to the GitHub Pages action.

### Worker behavior

- Routes `/v2/*` → `https://api.pokemontcg.io/v2/*`, preserving path + query string.
- Injects `X-Api-Key` from a Worker **secret** (`wrangler secret put POKEMONTCG_API_KEY`).
- Edge SWR via the Cache API: on cache miss fetch origin, then `cache.put` with `Cache-Control: s-maxage=3600, stale-while-revalidate=86400`; on stale hit return cached and `ctx.waitUntil(revalidate())`.
- Cache key = normalized request URL (path + sorted query). Only cache `GET` 2xx.
- CORS: `Access-Control-Allow-Origin` for the Pages origin (`https://<user>.github.io`), handle `OPTIONS` preflight.

### Client wiring

- `src/api.ts`: introduce `const API_BASE = import.meta.env.VITE_API_BASE ?? "https://api.pokemontcg.io"` and build all endpoint URLs from it. Default points at the deployed Worker once it exists.
- **Remove the client `X-Api-Key` path** (`pokemontcgFetch` no longer sets the header; key lives only in the Worker).
- `.env.example` documents `VITE_API_BASE`. `VITE_POKEMONTCG_API_KEY` is removed from client usage.
- `vite.config.ts`: API Workbox `urlPattern` updated to match the Worker origin (still `StaleWhileRevalidate`).

### Security

`VITE_POKEMONTCG_API_KEY` is currently inlined into the client bundle at build time (any `VITE_`-prefixed var is). If set in CI it ships in public JS on GitHub Pages — an exposed key. Moving it into the Worker secret removes it from the client entirely. **Rotate the key after the move** (README note; user performs the rotation).

### Tier 2 acceptance

- Client requests hit the Worker origin; responses carry the SWR cache headers.
- Built `dist/` contains no API key (`grep` check).
- Second user / cold load benefits from the shared edge cache.

---

## Tier 3 — wsrv.nl image CDN

### Helper

- New `src/components/holo-card/cdn-image.ts`:
  ```ts
  cdnImage(rawUrl: string, opts: { w: number; dpr?: number }): string
  // → https://wsrv.nl/?url=<enc>&w=<w>&dpr=<dpr>&output=webp&we
  // `we` = without-enlargement
  ```

### HoloCard `<picture>`

- Base image becomes:
  ```html
  <picture>
    <source srcset="cdnImage(large,{w}) 1x, cdnImage(large,{w,dpr:2}) 2x" type="image/webp" />
    <img class="holo-card-image" src={directSmall} ... />
  </picture>
  ```
- CDN WebP is primary; the direct image is automatic fallback if wsrv is unavailable. The `<img>` keeps `class="holo-card-image"` so all holo / tilt CSS is untouched.
- Widths: grid `w=300`, focus `w≈734`.

### Workbox

- Add a `wsrv.nl` runtime-cache entry: `CacheFirst`, `cacheName: "wsrv-images"`, 30-day expiry.

### Tier 3 acceptance

- Grid/focus images load as WebP from `wsrv.nl` at the right width (Network panel).
- Blocking wsrv (devtools) falls back to direct images with no broken images.

---

## Testing

### Unit (jsdom / vitest)

- `cdnImage` URL builder (encoding, dpr, width, `output=webp`, `we`).
- `apiCardToProps` populates both `imageUrl` and `imageUrlSmall`.
- `freshness` `kind: "cards"` TTL boundary.
- `cards-slice` reducers: append + dedup, `totalCount`-change reset, LRU eviction at the key cap.
- API base-URL resolution (`VITE_API_BASE` set vs default).
- `card-prefetch` promise-cache dedup (one in-flight request per id).

### Worker

- vitest with mocked `caches` / `fetch`: cache-key normalization, key injection, SWR header emission, CORS/preflight, GET-only + 2xx-only caching.

### Regression

- Update existing fixtures to include `imageUrlSmall` (grid/pack/collection/card-page tests).
- Full browser suite green.

### Manual (`vite preview`)

- Network panel: wsrv WebP + proxy hits; second load served from the SW.
- `grep` `dist/` for the API key → absent.

## Files touched (rough)

- `src/api.ts` — `API_BASE`, both image URLs, drop client key.
- `src/components/holo-card/{types.ts, holo-card.tsx, cdn-image.ts}` — img attrs, `priority`, `<picture>`, CDN helper.
- Grid callers — `card-grid.tsx`, `pokemon-timeline.tsx`, `pack-page.tsx`, `collection-page.tsx`, `card-page.tsx` (small vs large + `priority`).
- Store — new `cards-slice.ts`; `index.ts` partialize; `freshness.ts` (`"cards"` kind).
- `src/hooks/use-cards.ts` — back onto the persisted slice + SWR.
- `src/pages/card-prefetch.ts` (new) + `card-loader.ts` (await warmed promise).
- `vite.config.ts` — Workbox SWR, `devOptions`, proxy + wsrv patterns.
- `worker/` (new) — `wrangler.toml`, `src/index.ts`.
- `.env.example`, `README.md` — `VITE_API_BASE`, Worker deploy + key-rotation notes.

## Phasing

1. **Tier 1** — ship-able alone to Pages; biggest bang/buck. Land + verify first.
2. **Tier 2** — Worker + client base-URL switch + key removal/rotation.
3. **Tier 3** — wsrv `<picture>` + Workbox entry.

Each phase is independently testable and shippable.

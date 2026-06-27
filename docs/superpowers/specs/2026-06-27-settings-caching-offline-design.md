# Settings Page + Caching & Offline Design

Date: 2026-06-27
Status: Approved (delegate-mode brainstorm), pending implementation plan.
Depends on: L1 offline card detail (PR #22, merged to main).

## Overview

A dedicated `/settings` route gives the growing set of caching controls a real
home. It mirrors the existing `/profile` page. The sidebar user menu's L1
"Download card details" item is replaced by a "Settings" nav link. The settings
page carries a Caching & Offline section with two cards:

1. **Card database (L1, relocated)**: status plus Download / Re-sync / Evict for
   the offline detail blob. Reuses L1's existing store and actions; only the
   presentation moves from a dropdown item to a page control.
2. **Image cache (L3, new)**: an always-on browse cache. As the user views card
   images, a narrow Service Worker caches them so anything browsed works offline
   and reloads instantly. Bounded by caps; the thumbnail cap is user-configurable.

This is the L3 tier of the offline story (browse cache). L2 (precache the whole
collection, persisted, paywalled) and L4 (full catalog) are explicitly out of
scope and noted as future tiers that can layer on the same Service Worker.

## Goals

- A `/settings` route reachable from the user menu.
- Relocate L1's card-detail controls onto it (remove the dropdown toggle).
- An always-on browse cache (L3) that caches viewed card images, bounded and safe.
- Let the user set how many thumbnails to keep, see cache status, and evict.

## Non-goals (v1)

- L2 (collection precache) and L4 (full catalog). Future tiers.
- True LRU eviction (FIFO in v1).
- Byte-budget cap (count-based thumbnail cap in v1).
- `navigator.storage.persist()` for the browse cache (best-effort by design).
- Full PWA installability / a web app manifest.
- Other settings sections (appearance, account). The page is built to grow into
  them, but v1 ships only Caching & Offline.

## Assumptions (decisions made on the user's behalf)

1. `/settings` is a new TanStack file route mirroring `/profile` (`createFileRoute`,
   `GlassPanel`/`Eyebrow`/`Stat` primitives, `loader: () => getNavTreeFn()`).
2. The L1 dropdown toggle (`offline-toggle.tsx`) is removed; a "Settings" link
   replaces it in the user menu. L1's store and actions are reused by a new
   settings-page control.
3. The L3 image cache is always-on (default), via a vanilla Service Worker scoped
   to `wsrv.nl` only, registered at boot for every user. The "Off" cap (0) is the
   user's escape hatch.
4. Two caches: thumbnails (`w=300`, user-set cap, default 2000 images, about 50 MB)
   and hires (`w=734`, fixed 100-image FIFO, about 8 MB). The thumbnail cap is the
   user-facing "how many images" control.
5. The Service Worker learns the thumbnail cap by `postMessage` from the page
   (sent on boot and on change); it defaults to the constant until told. This
   avoids running IndexedDB inside the worker.
6. No `persist()` for the browse cache. It is best-effort, so the browser's own
   eviction under disk pressure is the ultimate backstop and the caps cannot fill
   a user's disk.
7. Each cache shows status (count plus approximate MB, summed from response
   `content-length`) and an Evict button.
8. Images are immutable per card, so there is no content-version staleness here.
9. The Service Worker NEVER intercepts non-`wsrv.nl` requests (no app JS/HTML).
   This is the hard safety line that keeps it clear of the version-check and chunk
   loading (the class of bug behind the PR #21 prod incident).

## Architecture

### Settings route

`src/routes/settings.tsx`: `createFileRoute("/settings")` with
`loader: () => getNavTreeFn()` and `head` title, rendering a `SettingsPage`
component that lays out sections. v1 renders one section component,
`<CachingSettings />`, composed of the two cards below.

### Navigation

`src/components/shell/sidebar-user-menu.tsx`: remove `<OfflineToggle />` and its
group; add a `DropdownMenuItem` linking to `/settings` (a `Settings` lucide icon),
next to "Edit profile". Delete `offline-toggle.tsx` and its test (relocated).

### Card database card (L1 relocated)

`src/components/settings/card-database-setting.tsx`: a `GlassPanel` that reads
`useDetailRuntime` (status, syncedAt) and calls `enableOffline` / `syncDetail` /
`disableOffline`. States mirror today's toggle (download / downloading / saved +
synced relative time / update available / error) but as a page control with
explicit buttons. S3 selectors.

### Browse cache Service Worker (L3)

`public/sw.js` (static, self-contained, about 50 lines):

```js
const HIRES_CAP = 100;
let thumbCap = 2000; // updated by postMessage from the page
self.addEventListener("message", (e) => {
  if (e.data?.type === "setThumbCap") thumbCap = e.data.cap;
});
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname !== "wsrv.nl") return; // never app assets
  const w = url.searchParams.get("w");
  const cacheName = w === "300" ? "ptcg-thumbs" : w === "734" ? "ptcg-hires" : null;
  if (!cacheName) return; // only the two known image sizes
  const cap = cacheName === "ptcg-thumbs" ? thumbCap : HIRES_CAP;
  if (cap <= 0) return; // caching off
  e.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) {
      await cache.put(e.request, res.clone());
      const keys = await cache.keys();
      for (let i = 0; i < keys.length - cap; i++) await cache.delete(keys[i]); // FIFO trim
    }
    return res;
  })());
});
```

### Cache policy (pure, tested)

`src/store/offline-images/cache-policy.ts`: `imageCacheKindFor(url: URL)` returns
`{ name: "ptcg-thumbs" | "ptcg-hires" }` or `null` (mirrors the SW's
hostname + `w` parsing, the single piece of duplicated logic, kept tiny and
documented). `evictionPlan(keys: readonly Request[], cap: number): Request[]`
returns the oldest keys to delete when over cap.

### Page side

`src/store/offline-images/browse-cache.ts`:
- `registerBrowseCacheSW(): Promise<void>` (register `/sw.js`, idempotent).
- `sendThumbCap(cap: number): void` (`postMessage` to the active SW).
- `cachedStats(): Promise<{ thumbs: number; hires: number; bytes: number }>`
  (open both caches, count keys, sum `content-length`).
- `clearImageCaches(): Promise<void>` (delete both caches).

`src/store/offline-images/images-runtime.ts`: `useImageCache` Zustand store
`{ thumbCap: number; thumbs: number; hires: number; bytes: number; status }`
with actions `setThumbCap(cap)` (persist + `sendThumbCap` + prune), `refreshStats()`,
`clearImages()`. `thumbCap` persists in a small IDB meta (mirrors L1's
`detail-store`); default 2000.

### Boot wiring

In the root client effect (where the app runs client-only boot effects), call
`registerBrowseCacheSW()` then `sendThumbCap(currentCap)`. Always on.

### Image cache card (L3 settings)

`src/components/settings/image-cache-setting.tsx`: a `GlassPanel` with a thumbnail
cap `Select` (presets: Off / 500 / 1000 / 2000 / 4000, each labeled with an
approximate MB), a status line ("N thumbnails + M hires cached, about X MB"), and
an Evict button. Reads `useImageCache` via S3 selectors.

## Data flow

- View a card image -> browser requests the `wsrv.nl` URL -> SW serves from cache
  (instant) or fetches + caches + FIFO-trims to the cap.
- Settings change cap -> store persists it -> `sendThumbCap` -> SW updates its cap
  -> next cache write trims to the new cap (or a page-triggered prune runs).
- Evict -> `clearImageCaches()` deletes both caches -> stats refresh to zero.

## Testing

- `cache-policy`: `imageCacheKindFor` (w=300 -> thumbs, w=734 -> hires,
  non-`wsrv.nl` and unknown `w` -> null), `evictionPlan` (returns the right oldest
  keys over cap, empty when under).
- `images-runtime`: `setThumbCap` (persists + messages), `refreshStats`,
  `clearImages`, against an injected fake `caches` and a fake SW messenger.
- `card-database-setting`: renders each L1 state and wires the buttons (reuses the
  L1 store; drive via `setState`).
- `image-cache-setting`: renders the cap select + status + evict; cap change calls
  the action.
- `settings` route: renders the Caching & Offline section.
- `sw.js`: thin enough to verify by eye plus a browser smoke test (go offline, a
  previously-viewed card image still loads; a never-viewed one does not; lowering
  the cap evicts down).
- Constraint: tests inject fakes for `caches` and the SW messenger (neither exists
  in happy-dom), the same seam pattern L1 used for its fetchers. S3 selectors for
  all new store consumers.

## Risks and mitigations

- Service Worker scope creep is the one real danger. Mitigated by the hard
  `wsrv.nl`-only guard, a `cache-policy` test asserting non-`wsrv.nl` URLs map to
  null, and a loud comment in `sw.js` to never broaden the scope.
- Mobile/Safari quota caps: mitigated by the count caps plus not calling
  `persist()` (the browser may evict the best-effort cache under pressure).
- FIFO can evict a hot-but-old image. Acceptable for v1; LRU is the upgrade.
- Duplicated `wsrv.nl` + `w` parsing between `sw.js` and `cache-policy.ts`: tiny
  (a few lines), documented, and covered by the policy test.

## Future work

- L2: precache the owned collection (persisted, paywalled) as a third card on the
  same settings page, reusing this Service Worker.
- L4: full-catalog images (paywalled).
- True LRU, byte-budget caps, full PWA installability, more settings sections.

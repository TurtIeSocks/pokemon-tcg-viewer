# Offline PWA Setup — Design

**Date:** 2026-07-09
**Branch:** `c/offline-pwa-setup-b56bc7`
**Status:** approved (full-auto)

## Problem

The app already has three offline building blocks on `main`:

- **Card images** cached by a hand-rolled runtime-cache service worker (`public/sw.js`, wsrv.nl only), with a settings UI and eviction policy.
- **Corpus** persisted to IndexedDB via `loadCorpus` (ETag conditional GET), so browse data survives offline once loaded.
- **Install meta** (`theme-color`, `apple-mobile-web-app-capable`, icons 192/512/maskable/apple-touch) in `__root.tsx`.

But it is **not a real PWA**:

1. **No web app manifest.** `vite-plugin-pwa@1.3.0` is in `package.json` but never wired into `vite.config.ts` (dead dep). No `.webmanifest`, no `<link rel="manifest">`. Result: not installable on Android / Chrome / desktop (no `beforeinstallprompt`); iOS only partially installable via the apple meta tags.
2. **App shell not precached.** `sw.js` deliberately touches only wsrv.nl images ("never app assets"). A cold offline launch = white screen: no cached JS / CSS / fonts / HTML.
3. **Full SSR + server-fn loaders break offline navigation.** `prerender: false`; many routes fetch page data via `createServerFn` RPCs (`getSetCardsFn`, `getCardForRouteFn`, `searchCardsFn`, pokedex, energy). Offline, those RPCs fail even though the corpus sits in IDB.

## Key constraint discovered during research

**`vite-plugin-pwa`'s auto SW/manifest generation does not work with TanStack Start.** The `closeBundle`/`generateSW` hooks don't fire because `tanstackStart()` replaces the build step (TanStack/router issue #4988, discussions #4770 / #4211). Community workarounds are a post-build Workbox/Serwist script or a custom SW-bundling vite plugin — extra build tooling and a documented-fragile integration.

**Decision: do not adopt `vite-plugin-pwa`/Workbox/Serwist.** Instead **extend the existing runtime-cache `public/sw.js`**. This matches the codebase's own established pattern (the image SW is already runtime-cache), needs zero build tooling, and sidesteps the incompatibility entirely. The dead `vite-plugin-pwa` dep is removed.

## Scope

This branch ships the **PWA platform**: installable + app-shell cached + offline-resilient. It does **not** rewrite server-fn route loaders to render offline (see Out of Scope).

### In scope

1. **Web App Manifest** — `public/manifest.webmanifest` + `<link rel="manifest">` in `__root.tsx`.
   - `name` "Cardstack: track your Pokémon TCG collection", `short_name` "Cardstack", `start_url` "/", `scope` "/", `display` "standalone", `background_color` "#0d0a16", `theme_color` "#0d0a16", `description`, `icons` (192 png, 512 png, 512 maskable png — all already in `public/`), `categories`.

2. **App-shell runtime caching in `public/sw.js`** (existing wsrv.nl image logic untouched, evaluated first):
   - Versioned shell cache namespace `ptcg-shell-v1` so `activate` can purge stale shell caches **without** deleting the image caches.
   - `install`: `skipWaiting()` + precache `/offline.html` into the shell cache.
   - `activate`: `clients.claim()` + delete stale `ptcg-shell-*` caches (keep the current version + the image caches).
   - `fetch` (GET only):
     - **Navigations** (`request.mode === "navigate"`): **NetworkFirst** — network success caches a clone (bounded), network failure returns the cached document, else the precached `/offline.html`.
     - **Same-origin `script` / `style` / `font`**: **CacheFirst** — safe because Vite asset filenames are content-hashed (immutable); a new build produces a new name, so CacheFirst never serves stale-wrong content. This is the exact "stale-chunk hydration crash" class the current SW comment warns about; hashed-name CacheFirst + NetworkFirst navigations avoid it.
     - **Same-origin `image`** (icons, `card-back.jpg`): **StaleWhileRevalidate**.
     - **Everything else** — RPCs (`/_serverFn*`), `/api/*`, `/corpus*`, cross-origin non-wsrv (Supabase): **passthrough** (no `respondWith`). Explicit deny-list guard for `/api/` and `/_serverFn` even on GET so an RPC response is never cached.
   - Never cache non-`ok` or opaque responses.

3. **`public/offline.html`** — self-contained (inline CSS; no external assets, since it renders offline), dark Liquid-Glass-styled: "You're offline", a note that the Vault and previously-viewed cards still work, and links to `/` and `/vault`.

4. **Offline indicator** — `useOnlineStatus` hook (`navigator.onLine` + `online`/`offline` events; extracted to a non-component file per the react-refresh rule) driving a subtle pill/banner in the shell. Reuses the existing `navigator.onLine` precedent in `userland-store`/`sync-engine`.

5. **SW-route policy test** — `src/store/offline-images/sw-shell-policy.ts` exports a pure `shellStrategy(req)` returning `"network-first" | "cache-first" | "stale-while-revalidate" | "passthrough"`, unit-tested to guard the correctness-critical rules (never cache RPC/API; navigations network-first; hashed assets cache-first). The conditions are mirrored in `sw.js` — the same tested-policy-plus-duplicated-SW pattern the repo already uses for `cache-policy.ts` (its cache names/caps are duplicated into `sw.js`).

6. **Remove the dead `vite-plugin-pwa` dependency** and reconcile `bun.lock`.

### Out of scope (documented follow-up — gap #3)

Converting the server-fn route loaders (`getSetCardsFn`, `getCardForRouteFn`, `searchCardsFn`, pokedex/energy) to fall back to the IDB corpus client-side so **newly navigated** offline routes render. After this branch:

- **Work offline:** install to home screen; home/browse (in-memory corpus); Vault (local-first IDB); the in-app card modal (in-memory corpus + optional detail blob); **any previously-visited URL** (its SSR HTML + hashed chunks are cached).
- **Don't work offline yet:** a *first* client navigation to an unvisited set/card/search/pokedex URL — the loader RPC fails; the user sees the graceful `/offline.html` fallback (on a full navigation) rather than a crash.

That client-fallback conversion is a separate, larger effort and gets its own spec.

## Architecture / data flow

```
Browser ── navigate ──▶ SW.fetch
  ├─ wsrv.nl image?     → existing thumb/hires cache (unchanged)
  ├─ navigation?        → NetworkFirst → cache | offline.html
  ├─ same-origin js/css/font? → CacheFirst (immutable hashed)
  ├─ same-origin image? → StaleWhileRevalidate
  └─ RPC / api / corpus / cross-origin → passthrough (network only)

App shell:
  __root head → <link rel="manifest"> + existing icons/theme-color
  RootComponent → registerBrowseCacheSW() (existing) → SW controls page
  Shell → <OnlineIndicator/> (useOnlineStatus)
```

Why NetworkFirst navigations are safe with the version-check system: an online reload (prompted by the existing `VersionToast` on a new deploy) fetches fresh SSR HTML referencing the new hashed chunks, which CacheFirst then fetches and stores under their new names. Offline, the last cached HTML references chunks that were cached under the same immutable names, so HTML and chunks stay consistent. No separate SW-update toast is added — the existing version-check already owns "new version, reload".

## Testing

- `sw-shell-policy.test.ts` — pure policy: navigation → network-first; `.js`/`.css`/`.woff2` same-origin → cache-first; same-origin image → SWR; `/api/*`, `/_serverFn*`, `/corpus`, cross-origin → passthrough; non-GET → passthrough.
- `use-online-status.test.ts` — reflects `navigator.onLine`; flips on `online`/`offline` events; cleans up listeners.
- Manual (preview + DevTools offline): manifest parses + installable; home/vault render offline; cold offline navigation to an unvisited RPC route serves `/offline.html`; offline indicator appears/clears.

## Files

- `public/manifest.webmanifest` (new)
- `public/offline.html` (new)
- `public/sw.js` (extend)
- `src/store/offline-images/sw-shell-policy.ts` (+ `.test.ts`) (new)
- `src/lib/use-online-status.ts` (+ `.test.ts`) (new)
- `src/components/shell/online-indicator.tsx` (new; mounted in the shell)
- `src/routes/__root.tsx` (add manifest link; mount indicator)
- `package.json` + `bun.lock` (drop `vite-plugin-pwa`)

# Phase 5 / #7 — PWA + IndexedDB

**Date:** 2026-05-03
**Status:** Approved (design)
**Roadmap phase:** 5 of 5 (final phase). Closes the roadmap.

## Context

The viewer ships rich features across 4 phases — set browsing, per-pokemon view, focus view, advanced filters, timeline, collection, device tilt, pack opening. Storage uses Zustand persist → localStorage with a `STORAGE_VERSION` chain (currently v4). Phase 5 ships two upgrades that turn the app into a true installable PWA:

1. **Service worker + manifest** — app is installable, runs offline, caches built assets + images + recent API responses.
2. **IndexedDB-backed Zustand persist** — moves the persisted blob off localStorage onto IDB (no quota cliff at 5 MB; async storage suits Zustand's hydration model).

The two land together because PWAs are typically expected to work offline against locally-cached data, and IDB is the right substrate for that data layer.

## Goals

1. **Installable** on iOS Safari, Android Chrome, desktop Chromium. Web manifest + icons + theme color.
2. **Offline-tolerant**: built JS/CSS/HTML precached, API responses runtime-cached (cache-first with TTL), images runtime-cached. Navigation falls back to the SPA shell.
3. **IndexedDB persist** via a custom Zustand `PersistStorage` adapter backed by `idb-keyval`.
4. **One-time migration** of any existing v4 localStorage blob into IDB on first v5 load. Idempotent.
5. **Install affordance UI** — a small "Install app" button when `beforeinstallprompt` fires (Android/Chromium). iOS gets a "Tap share → Add to Home Screen" tip text only.
6. **Offline indicator** — small badge near the nav when `navigator.onLine === false`.

## Non-goals (deferred)

- Background sync for any kind of write queue.
- Push notifications.
- Periodic background fetch.
- Workbox precaching of pokemontcg.io API responses at build time. Runtime cache-on-demand only.
- Selective per-route prefetching.
- IndexedDB-direct queries (the store still hydrates a single blob; we don't change the access pattern, just the substrate).
- Asset compression in the SW (vite already gzips at build).
- Telemetry / install analytics.
- iOS install flow that mimics Android (impossible).
- Opt-out UI for PWA / cache.

## Architecture

### Service worker via `vite-plugin-pwa`

`vite-plugin-pwa` in `registerType: "autoUpdate"` mode. The plugin auto-generates a Workbox-based SW from a manifest config plus runtime caching rules.

Runtime caching:
- **pokemontcg.io API responses**: cache-first, expiration `{ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }` (7 days)
- **images.pokemontcg.io**: cache-first, `{ maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 }` (30 days)
- **Self-origin assets** (precached via the auto-generated precache manifest)

Navigation fallback: SPA index.html. Already required for the existing 404.html GitHub Pages hack — the SW handles it cleanly for offline.

Config goes in `vite.config.ts`:

```ts
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	base: "/pokemon-tcg-viewer/",
	plugins: [
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["favicon.svg"],
			manifest: {
				name: "Pokémon TCG Holo Playground",
				short_name: "Holo TCG",
				description: "Interactive Pokémon TCG card viewer",
				theme_color: "#0f0823",
				background_color: "#0f0823",
				display: "standalone",
				start_url: "/pokemon-tcg-viewer/",
				scope: "/pokemon-tcg-viewer/",
				icons: [
					{ src: "icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "icon-512.png", sizes: "512x512", type: "image/png" },
					{
						src: "icon-512-maskable.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				navigateFallback: "/pokemon-tcg-viewer/index.html",
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/api\.pokemontcg\.io\//,
						handler: "CacheFirst",
						options: {
							cacheName: "pokemontcg-api",
							expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
						},
					},
					{
						urlPattern: /^https:\/\/images\.pokemontcg\.io\//,
						handler: "CacheFirst",
						options: {
							cacheName: "pokemontcg-images",
							expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
						},
					},
				],
			},
		}),
	],
});
```

### Icons

Generate three PNG icons (192, 512, 512 maskable) from the existing `public/favicon.svg`. Bash one-liners with ImageMagick or similar are not portable — use a tiny Node script in this worktree to render via Sharp, OR commit pre-rendered PNGs.

**Decision**: pre-render PNGs at design time and commit. Saves build time. The Sharp dependency would add ~30 MB to node_modules for a one-time use.

Tooling: use `bun --bun` with a one-off script (`scripts/build-icons.ts`) that fetches Sharp on demand, generates PNGs, then never runs again. The PNGs are committed to `public/`.

OR cleaner: build the PNGs externally and commit. The plan task uses `bun add -d sharp` then `bun scripts/build-icons.ts`, with the resulting PNGs committed.

### IDB storage adapter

`src/store/idb-storage.ts`:

```ts
import { del, get, set } from "idb-keyval";
import type { PersistStorage } from "zustand/middleware";

const STORAGE_KEY = "pokemon-tcg-viewer-state";

export function createIdbStorage<T>(): PersistStorage<T> {
	return {
		getItem: async () => {
			const value = await get<string | undefined>(STORAGE_KEY);
			if (value === undefined) return null;
			return JSON.parse(value) as { state: T; version: number };
		},
		setItem: async (_name, value) => {
			await set(STORAGE_KEY, JSON.stringify(value));
		},
		removeItem: async () => {
			await del(STORAGE_KEY);
		},
	};
}
```

Notes:
- Returns Promises throughout — Zustand 5 persist supports async storage.
- Stringifies for the same value format Zustand's JSON storage uses, so the existing persisted blob shape works post-migration.
- The `_name` ignore is intentional: there's only ever one store; we hardcode the key.
- Uses `idb-keyval` (tiny IDB wrapper — ~600B gzipped).

### One-time localStorage → IDB migration

On `getItem` first call in v5, fall back to localStorage if IDB is empty:

```ts
getItem: async () => {
	const value = await get<string | undefined>(STORAGE_KEY);
	if (value !== undefined) {
		return JSON.parse(value);
	}
	// Fallback: first v5 load. Migrate from localStorage if present.
	const legacy = typeof localStorage !== "undefined"
		? localStorage.getItem("pokemon-tcg-viewer")
		: null;
	if (legacy !== null) {
		await set(STORAGE_KEY, legacy);
		localStorage.removeItem("pokemon-tcg-viewer");
		return JSON.parse(legacy);
	}
	return null;
},
```

After migration, the legacy key is cleaned out so it doesn't ghost-rehydrate later.

### Store changes

`src/store/index.ts`:
- `STORAGE_VERSION` bumps from 4 → 5.
- Pass `storage: createIdbStorage<AppStore>()` to `persist`.
- Migration chain gains a `version < 5` branch that's a no-op (the substrate change doesn't invalidate the data shape).

```ts
migrate: (persisted, version) => {
	let next = persisted as Partial<AppStore>;
	if (version < 3) next = { ...next, owned: {} };
	if (version < 4) next = { ...next, packCards: {}, packCardsFetchedAt: {} };
	// v4 → v5 is substrate-only (localStorage → IDB), handled in the adapter.
	return next as AppStore;
},
```

### `<InstallPrompt>` component

`src/components/install-prompt/install-prompt.tsx`:

- Listens for `window.beforeinstallprompt` event.
- When fired: stores the deferred prompt, renders a small "Install app" button.
- Clicking the button calls `event.prompt()` and listens for `userChoice`.
- After user accepts or dismisses, hides the button.
- On iOS (no event fires) and on already-installed contexts (`window.matchMedia("(display-mode: standalone)").matches`), renders nothing.

Tests:
- Default render = null (no event yet)
- After dispatching a synthetic `beforeinstallprompt`, renders the button
- Click calls the deferred `prompt()` method

### `<OfflineIndicator>` component

`src/components/offline-indicator/offline-indicator.tsx`:

- Reads `navigator.onLine` on mount.
- Subscribes to `window` `online` / `offline` events.
- When offline: renders a small `<span>` chip "Offline" near the nav.
- When online: renders nothing.

Tests:
- Initial online state → renders nothing
- After dispatching `offline` event → renders "Offline"
- Subsequent `online` event → renders nothing

### Root layout

`src/root-layout.tsx`: add both new components alongside the nav. They render compactly near the existing nav links.

### HTML head

`index.html` gets:
- `<link rel="manifest" href="/pokemon-tcg-viewer/manifest.webmanifest">` (auto-injected by `vite-plugin-pwa`)
- `<meta name="theme-color" content="#0f0823">`
- `<meta name="apple-mobile-web-app-capable" content="yes">` for iOS standalone behavior
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- iOS apple-touch-icon link to icon-192.png

`vite-plugin-pwa` injects manifest link automatically; we add the iOS meta tags manually.

## Risks

- **Async hydration**: Zustand persist's `onRehydrateStorage` runs after the IDB read completes. Existing code reads store synchronously — initial reads will see empty state for a tick. Mitigated: most UI shows loading state anyway via `useEffect`-triggered fetches; first paint will look identical to a clean load. App doesn't gate on `hasHydrated`.
- **Migration data loss**: if `JSON.parse(legacy)` throws, user loses their state. Wrap in try/catch and log; degrade to a clean IDB.
- **Service worker cache staleness**: cache-first means a deployed bugfix to a cached API response won't reach the user for up to 7 days. Acceptable for hobby app; user can hard reload to bust.
- **`vite-plugin-pwa` build size**: Workbox runtime adds ~30 KB gzip. Acceptable.
- **PWA install detection on iOS**: not possible; we show a tip text inline as a fallback.
- **`navigator.onLine`** is unreliable (true even when network is down behind a captive portal). Best-effort UI hint.
- **Test environment**: happy-dom may not expose `localStorage`, `navigator.onLine`, `beforeinstallprompt`. Tests must polyfill or mock where missing.
- **SW updates on stale tab**: `autoUpdate` won't kick in until the user closes and reopens the tab. Vite-plugin-pwa supports a programmatic prompt; out of scope for v1.
- **Icons**: real PNGs must exist in `public/` for the manifest to be valid. Pre-generate from the SVG.
- **GitHub Pages basename**: SW scope must be `/pokemon-tcg-viewer/`, matching `base` in `vite.config.ts`. Manifest's `start_url` and `scope` must match too.

## Testing

New tests (~7, baseline 139 → 146):

`idb-storage.test.ts` (3 tests):
- `getItem` returns null when nothing stored
- `setItem` then `getItem` round-trips the value
- `getItem` migrates from localStorage when IDB empty + legacy key present, then deletes legacy key

`install-prompt.test.tsx` (2 tests):
- Renders nothing by default
- After dispatching `beforeinstallprompt`, renders the install button

`offline-indicator.test.tsx` (2 tests):
- Renders nothing when `navigator.onLine === true`
- After dispatching `offline` event, renders the indicator

Existing 139 tests must continue to pass after the storage substrate switch. The Zustand persist async path may add a microtask delay during hydration; happy-dom's microtask queue should handle this transparently.

## Manual smoke test

1. `bun run build` produces a `dist/` with `manifest.webmanifest`, the auto-generated SW, and PWA icons.
2. `bun run preview` serves the built app. Visit `/pokemon-tcg-viewer/`. In devtools → Application → Manifest: see name, icons, theme. Service Workers: registered, activated.
3. Add 3 cards to collection. Reload. Cards still there. Open Application → IndexedDB: see `keyval-store` → `pokemon-tcg-viewer-state` with the persisted blob.
4. Migration test: set localStorage's `pokemon-tcg-viewer` to a known v4 payload, clear IDB, reload. Cards from the legacy blob appear; localStorage entry is gone afterward.
5. Offline test: devtools → Network → Offline. Reload. App still loads from precache + IDB.
6. Install test: Chrome desktop should show an install icon in the address bar. Click → install. App opens in standalone window.
7. Indicator test: toggle devtools Offline → "Offline" chip appears in nav. Toggle back → disappears.

## Implementation order

1. Add `idb-keyval` + `vite-plugin-pwa` deps.
2. Generate PWA icons (one-off Sharp script committed alongside outputs).
3. Configure `vite-plugin-pwa` in `vite.config.ts`.
4. Add manifest + iOS meta to `index.html`.
5. `idb-storage` adapter + tests (TDD).
6. Migrate Zustand store to v5 with IDB adapter.
7. `<InstallPrompt>` (TDD).
8. `<OfflineIndicator>` (TDD).
9. Wire both into `root-layout.tsx`.
10. Verify build + manual smoke (devtools mock).

## Out-of-scope alternates considered

- **Direct IndexedDB queries** (skip Zustand persist, query IDB stores per-feature). Rejected — too much refactor for the same outcome.
- **Workbox precache for API responses at build time**: rejected; pokemontcg.io API is unbounded.
- **Service worker that gates on hydration**: rejected; the async persist with degraded first-tick render is fine.
- **iOS install banner that mimics Android prompt**: technically impossible.
- **Cloudflare Workers / proxy for cross-origin caching**: out of scope for a GitHub-Pages app.

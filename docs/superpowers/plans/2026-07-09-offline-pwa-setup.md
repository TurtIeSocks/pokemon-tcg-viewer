# Offline PWA Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the app an installable, app-shell-cached, offline-resilient PWA by adding a web manifest, extending the existing runtime-cache service worker to the app shell, and adding an offline fallback + indicator — without adopting `vite-plugin-pwa` (incompatible with TanStack Start).

**Architecture:** Extend the hand-rolled `public/sw.js` (already a runtime image cache) with same-origin shell caching: NetworkFirst navigations (→ `/offline.html` fallback), CacheFirst for content-hashed JS/CSS/fonts (stale-safe), StaleWhileRevalidate images, passthrough for RPC/API/corpus. Add `manifest.webmanifest`, an `offline.html`, and an online-status indicator. The routing policy is mirrored in a tested pure module.

**Tech Stack:** TanStack Start, vanilla service worker (Cache Storage API), React, bun test (happy-dom + fake-indexeddb), Biome.

## Global Constraints

- **No em-dashes in user-facing copy.** Periods/commas/parentheses instead. Code/comments unaffected.
- **Lint with explicit paths:** `bunx biome check --write --config-path=. <files>`.
- **Typecheck at task end:** `bunx tsc -b`.
- **Tests must not hit the network**; happy-dom + fake-indexeddb preloaded via `bunfig.toml`. Prefer `spyOn` over `mock.module`.
- **Manual `useMemo`/`useCallback` are intentional** (React Compiler on); don't strip.
- **Pre-extract non-component exports** (hooks/types) to sibling files to avoid `react-refresh/only-export-components`.
- **sw.js is a plain `public/` file** — it cannot import from `src/`; policy logic is duplicated there with a comment pointing at the tested source of truth (same pattern as `cache-policy.ts` → `sw.js`).

---

### Task 1: Remove dead `vite-plugin-pwa` dependency

**Files:** Modify `package.json`; reconcile `bun.lock`.

- [ ] Remove the `"vite-plugin-pwa"` line from `devDependencies`/`dependencies` in `package.json`.
- [ ] Run `bun install` to rewrite `bun.lock`.
- [ ] Verify it isn't imported anywhere: `grep -rniE "vite-plugin-pwa|VitePWA" src vite.config.ts` → empty.
- [ ] Commit: `git add package.json bun.lock && git commit -m "chore(pwa): drop unused vite-plugin-pwa (incompatible with TanStack Start)"`

---

### Task 2: Web app manifest

**Files:** Create `public/manifest.webmanifest`; Modify `src/routes/__root.tsx` (head `links`).

- [ ] Create `public/manifest.webmanifest`:

```json
{
  "name": "Cardstack: track your Pokémon TCG collection",
  "short_name": "Cardstack",
  "description": "Browse the whole Pokémon TCG catalog free, then track every copy you own. Local-first and open-source.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0d0a16",
  "theme_color": "#0d0a16",
  "categories": ["utilities", "productivity", "entertainment"],
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] In `__root.tsx` head `links`, add before the icon entries: `{ rel: "manifest", href: "/manifest.webmanifest" }`.
- [ ] `bunx tsc -b`; commit `feat(pwa): add web app manifest + link`.

---

### Task 3: SW shell routing policy (pure, tested)

**Files:** Create `src/store/offline-images/sw-shell-policy.ts` + `sw-shell-policy.test.ts`.

**Produces:** `shellStrategy(input: { method: string; sameOrigin: boolean; mode: string; destination: string; pathname: string }): "network-first" | "cache-first" | "stale-while-revalidate" | "passthrough"`

- [ ] **Step 1 — failing test** `sw-shell-policy.test.ts`:

```ts
import { expect, test } from "bun:test";
import { shellStrategy } from "./sw-shell-policy";

const base = { method: "GET", sameOrigin: true, mode: "cors", destination: "", pathname: "/x" };

test("navigations → network-first", () => {
  expect(shellStrategy({ ...base, mode: "navigate", destination: "document", pathname: "/base-set" })).toBe("network-first");
});
test("same-origin script/style/font → cache-first", () => {
  for (const d of ["script", "style", "font"])
    expect(shellStrategy({ ...base, destination: d, pathname: `/assets/x.${d}` })).toBe("cache-first");
});
test("same-origin image → stale-while-revalidate", () => {
  expect(shellStrategy({ ...base, destination: "image", pathname: "/icon-192.png" })).toBe("stale-while-revalidate");
});
test("RPC / api / corpus → passthrough", () => {
  for (const p of ["/_serverFn/getSetCardsFn", "/api/stripe/webhook", "/corpus", "/corpus-region/asia"])
    expect(shellStrategy({ ...base, destination: "empty", pathname: p })).toBe("passthrough");
});
test("cross-origin non-nav → passthrough", () => {
  expect(shellStrategy({ ...base, sameOrigin: false, destination: "script", pathname: "/x.js" })).toBe("passthrough");
});
test("non-GET → passthrough", () => {
  expect(shellStrategy({ ...base, method: "POST", mode: "navigate", destination: "document" })).toBe("passthrough");
});
```

- [ ] **Step 2** run `bun test src/store/offline-images/sw-shell-policy.test.ts` → FAIL (no module).
- [ ] **Step 3 — implement** `sw-shell-policy.ts`:

```ts
export type ShellStrategy =
  | "network-first"
  | "cache-first"
  | "stale-while-revalidate"
  | "passthrough";

export interface ShellRequestInfo {
  method: string;
  sameOrigin: boolean;
  mode: string;
  destination: string;
  pathname: string;
}

// Paths that must always hit the network (dynamic server responses); never cached.
const NEVER_CACHE = ["/_serverFn", "/api/", "/corpus"];

/**
 * Pure routing decision mirrored inside public/sw.js (which cannot import from
 * src). Source of truth for the shell caching policy; keep sw.js in sync.
 */
export function shellStrategy(r: ShellRequestInfo): ShellStrategy {
  if (r.method !== "GET") return "passthrough";
  // Navigations: network-first so online users always get fresh SSR HTML; the
  // SW falls back to cached HTML / offline.html when the network is gone.
  if (r.mode === "navigate" || r.destination === "document")
    return "network-first";
  if (!r.sameOrigin) return "passthrough";
  if (NEVER_CACHE.some((p) => r.pathname.startsWith(p))) return "passthrough";
  if (r.destination === "script" || r.destination === "style" || r.destination === "font")
    return "cache-first"; // Vite content-hashes these names → immutable, stale-safe.
  if (r.destination === "image") return "stale-while-revalidate";
  return "passthrough";
}
```

- [ ] **Step 4** run test → PASS.
- [ ] Lint + `git add ... && git commit -m "feat(pwa): tested shell routing policy"`.

---

### Task 4: Extend `public/sw.js` with shell caching

**Files:** Modify `public/sw.js`.

- [ ] Keep the existing wsrv.nl image block first. Add a `SHELL_CACHE = "ptcg-shell-v1"`, precache `/offline.html` on `install`, purge stale `ptcg-shell-*` on `activate` (keep image caches `ptcg-thumbs`/`ptcg-hires`), and a shell-routing branch mirroring `shellStrategy`. Full file:

```js
// Runtime caches:
//  - Browse cache: wsrv.nl card images (thumbs/hires) — UNCHANGED below.
//  - Shell cache : same-origin app shell so the installed PWA works offline.
// Policy source of truth: src/store/offline-images/sw-shell-policy.ts (this file
// cannot import from src, so the rules are mirrored here — keep in sync).
const HIRES_CAP = 100;
let thumbCap = 2000;

const SHELL_CACHE = "ptcg-shell-v1";
const NAV_CACHE = "ptcg-nav-v1"; // cached navigation documents
const NAV_CAP = 60;
const OFFLINE_URL = "/offline.html";
const NEVER_CACHE = ["/_serverFn", "/api/", "/corpus"];
const KEEP_CACHES = [SHELL_CACHE, NAV_CACHE, "ptcg-thumbs", "ptcg-hires"];

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "setThumbCap" && typeof e.data.cap === "number")
    thumbCap = e.data.cap;
});

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        await cache.add(OFFLINE_URL);
      } catch {
        // offline.html missing in some build states is non-fatal.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((n) => (KEEP_CACHES.includes(n) ? null : caches.delete(n))),
      );
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName, cap) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - cap; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const req = e.request;

  // --- 1. Browse cache: wsrv.nl images (unchanged) ---
  if (req.method === "GET" && url.hostname === "wsrv.nl") {
    const w = url.searchParams.get("w");
    const name = w === "300" ? "ptcg-thumbs" : w === "734" ? "ptcg-hires" : null;
    if (name) {
      const cap = name === "ptcg-thumbs" ? thumbCap : HIRES_CAP;
      if (cap <= 0) return;
      e.respondWith(
        (async () => {
          const cache = await caches.open(name);
          const hit = await cache.match(req);
          if (hit) return hit;
          const res = await fetch(url.href, { mode: "cors" });
          if (res.ok) {
            await cache.put(req, res.clone());
            const keys = await cache.keys();
            for (let i = 0; i < keys.length - cap; i++) await cache.delete(keys[i]);
          }
          return res;
        })(),
      );
    }
    return;
  }

  // --- 2. App shell (mirror of shellStrategy) ---
  if (req.method !== "GET") return;
  const sameOrigin = url.origin === self.location.origin;
  const dest = req.destination;
  const isNav = req.mode === "navigate" || dest === "document";

  if (isNav) {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(NAV_CACHE);
            cache.put(req, res.clone());
            trim(NAV_CACHE, NAV_CAP);
          }
          return res;
        } catch {
          const cache = await caches.open(NAV_CACHE);
          const hit = await cache.match(req);
          if (hit) return hit;
          const shell = await caches.open(SHELL_CACHE);
          const offline = await shell.match(OFFLINE_URL);
          return offline || Response.error();
        }
      })(),
    );
    return;
  }

  if (!sameOrigin) return;
  if (NEVER_CACHE.some((p) => url.pathname.startsWith(p))) return;

  if (dest === "script" || dest === "style" || dest === "font") {
    e.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  if (dest === "image") {
    e.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(req);
        const fetching = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fetching;
      })(),
    );
    return;
  }
});
```

- [ ] Lint (`biome check --write --config-path=. public/sw.js`), commit `feat(pwa): app-shell runtime caching in service worker`.

---

### Task 5: Offline fallback page

**Files:** Create `public/offline.html`.

- [ ] Create a self-contained dark page (inline CSS, no external assets), matching the canvas `#0d0a16` + violet accent, headline "You're offline", copy noting the Vault and previously-viewed cards still work, and links to `/` and `/vault`. No em-dashes. (Full HTML written at implementation time; must reference no external file since it renders offline.)
- [ ] Commit `feat(pwa): offline fallback page`.

---

### Task 6: Online-status hook (tested)

**Files:** Create `src/lib/use-online-status.ts` + `use-online-status.test.ts`.

**Produces:** `useOnlineStatus(): boolean`

- [ ] **Step 1 — failing test:**

```ts
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useOnlineStatus } from "./use-online-status";

afterEach(cleanup);

function setOnline(v: boolean) {
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
}

test("reflects navigator.onLine initially", () => {
  setOnline(false);
  const { result } = renderHook(() => useOnlineStatus());
  expect(result.current).toBe(false);
});

test("flips on online/offline events", () => {
  setOnline(true);
  const { result } = renderHook(() => useOnlineStatus());
  expect(result.current).toBe(true);
  act(() => { setOnline(false); window.dispatchEvent(new Event("offline")); });
  expect(result.current).toBe(false);
  act(() => { setOnline(true); window.dispatchEvent(new Event("online")); });
  expect(result.current).toBe(true);
});
```

- [ ] **Step 2** run → FAIL. (Verify the project's render-hook util; if `@testing-library/react` isn't present, use the repo's existing hook-test pattern — check an existing `use-*.test.ts`.)
- [ ] **Step 3 — implement:**

```ts
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const getSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true; // assume online during SSR

/** True when the browser reports a network connection. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [ ] **Step 4** run → PASS. Lint + commit `feat(pwa): useOnlineStatus hook`.

---

### Task 7: Offline indicator + mount

**Files:** Create `src/components/shell/online-indicator.tsx`; Modify `src/routes/__root.tsx` (mount in shell).

- [ ] Create `online-indicator.tsx`: returns `null` when online; when offline renders a small fixed pill (bottom-left, above the bottom nav) using glass tokens: dot + "Offline" text (localized message `m.offline_indicator()` — add key to `messages/en.json`; other locales fall back to en). `motion-reduce` safe; `role="status"` `aria-live="polite"`.

```tsx
import { useOnlineStatus } from "@/lib/use-online-status";
import { m } from "@/paraglide/messages";

export function OnlineIndicator() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-(--r-pill) border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-(--ink) backdrop-blur-xl shadow-(--shadow) md:bottom-4"
    >
      <span className="size-2 rounded-full bg-(--faint)" aria-hidden="true" />
      {m.offline_indicator()}
    </div>
  );
}
```

- [ ] Add `"offline_indicator": "Offline"` to `messages/en.json` (alphabetical slot).
- [ ] Mount `<OnlineIndicator />` in the shell in `__root.tsx` (near the existing `<Toaster />`).
- [ ] `bunx tsc -b`; lint; commit `feat(pwa): offline indicator`.

---

### Task 8: Verify + finalize

- [ ] Run full suite: `bun test` (backgrounded), `bunx tsc -b`, `bunx biome check --config-path=.`.
- [ ] Dev preview: manifest parses (DevTools → Application → Manifest, installable), SW active, home + `/vault` render offline (DevTools offline), cold offline navigation to an unvisited set URL serves `/offline.html`, offline indicator toggles with the offline checkbox.
- [ ] Update `CLAUDE.md` PWA note if warranted (brief).
- [ ] Finish branch per merge-locally default.

## Self-Review

- Spec coverage: manifest (T2), shell caching (T4) + tested policy (T3), offline.html (T5), online indicator (T6/T7), drop dead dep (T1), verify (T8). All spec "In scope" items mapped. Out-of-scope (gap #3) intentionally excluded.
- Placeholders: offline.html body + final indicator classes finalized at implementation; policy/SW/hook code is complete inline.
- Type consistency: `shellStrategy`/`ShellRequestInfo` (T3) match sw.js mirror (T4); `useOnlineStatus` (T6) consumed by `OnlineIndicator` (T7).

# Version-update toast — design

**Date:** 2026-06-09
**Status:** Approved (brainstorming) → ready for implementation plan
**Branch:** `c/bold-neumann-5ac0d5`

## Problem

When a new build is deployed, tabs already open keep running the old client
bundle indefinitely. There is no signal telling the user a newer version exists.
We want a toast — "New version available" with a **Reload** action — to surface
when the running tab is stale.

Secondary goal (the real motivation): stop rebuilding this behavior in every app.
The mechanism should be a **self-contained, copy-out-able module**, not glue
scattered through the app.

## Goals

- Detect, from an already-open tab, that a newer build has been deployed.
- Surface a manual, non-destructive toast: a **Reload** button, no auto-reload.
- Package the whole thing as a portable in-repo module (`src/lib/version-check/`)
  with a README so it drops into the next Vite + React app.
- Zero new runtime infrastructure: no service worker, no server state, no auth.

## Non-goals

- Offline support / installability / precaching (that's the PWA/service-worker
  path we explicitly did **not** take — see Decisions).
- Auto-reloading the tab (the Vault has live forms + CSV import; a surprise
  reload would wipe in-progress work).
- Cross-tab coordination, background sync, push notifications.
- A published npm package (copy-out module now; extraction to `packages/` later
  is out of scope).

## Decisions (settled during brainstorming)

1. **Detection = custom version-poll**, not `vite-plugin-pwa`, not asset-hash diff.
   - `vite-plugin-pwa@^1.3.0` is already a (dangling, unconfigured) dep, and is the
     "real external package." Rejected because it forces a **service worker** onto
     an SSR + prerendered app — stale-HTML risk, interaction with the corpus blob
     cache, and offline behavior nobody asked for. Bigger surface for an unwanted
     feature.
   - Version-poll is ~50 lines, no service worker, framework-portable → it is the
     reusable primitive this work is meant to produce.
2. **Reload UX = manual, sticky toast.** `duration: Infinity`, a **Reload** button,
   dismissible. Never auto-reloads. Safe to leave on screen mid-edit.
3. **Packaging = self-contained in-repo module.** One folder, headless hook + thin
   UI + build plugin + README. No new workspace/package, not inlined into `__root`.

## Architecture

New module `src/lib/version-check/`:

| File | Role |
|------|------|
| `resolve-version.ts` | Pure fn. Resolves the build token: `env SHA → git SHA → build timestamp` (first hit wins). Build-time only; no runtime imports. |
| `vite-plugin-version.ts` | Vite plugin. Injects `__APP_VERSION__`, emits `version.json`, serves it in dev. |
| `use-version-available.ts` | Headless React hook. Polls, compares, exposes `{ updateReady, latestVersion, dismiss }`. |
| `version-toast.tsx` | Null-rendering component. Wires the hook → `sonner` toast. |
| `version-check.d.ts` | Ambient `declare const __APP_VERSION__: string` (travels with the folder on copy-out). |
| `index.ts` | Barrel: re-exports the **runtime only** (hook + component). The plugin is imported directly from `vite-plugin-version.ts` by `vite.config.ts` — deliberately kept *out* of the barrel so its Node-only `child_process`/git code never enters the client graph. |
| `README.md` | Copy-out instructions — the portability deliverable. |

Plus:
- `src/components/ui/sonner.tsx` — shadcn-generated `<Toaster>`, theme-adapted (below).
- Edits to `vite.config.ts` (register plugin) and `src/routes/__root.tsx` (mount).

### Data flow

The whole trick: one **frozen** token baked into the client, one **live** token
served per deploy. Mismatch ⇒ the tab is stale.

```
BUILD TIME (per deploy)
  resolve-version.ts → token "a1b2c3"
        │
        ├─ define: __APP_VERSION__ = "a1b2c3"   → baked into client bundle (FROZEN at build)
        └─ emit  /version.json = {"version":"a1b2c3"}  → served live (REFRESHES every deploy)

RUNTIME (old tab still open after a new deploy shipped "d4e5f6")
  hook boots:  current = __APP_VERSION__         // "a1b2c3", frozen
  on tab-focus / interval:
      fetch("/version.json?t=<now>", {cache:"no-store"}) → {"version":"d4e5f6"}
      "d4e5f6" !== "a1b2c3"  → updateReady = true
      → toast("New version available", [Reload])
```

The old client carries its build's token frozen in-bundle; `/version.json` always
reflects the newest deploy because each deploy regenerates it. No service worker,
no server-side session, no comparison state on the server.

## Component contracts

### `resolve-version.ts`

```ts
interface VersionEnv {
  APP_VERSION?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
  CF_PAGES_COMMIT_SHA?: string;
  GITHUB_SHA?: string;
}

// Pure + injectable for tests. `runGit` defaults to `git rev-parse --short HEAD`.
function resolveVersion(
  env: VersionEnv,
  runGit?: () => string | null,
  now?: () => number,
): string
```

Precedence: `APP_VERSION` → `VERCEL_GIT_COMMIT_SHA` → `CF_PAGES_COMMIT_SHA` →
`GITHUB_SHA` → `runGit()` (short SHA) → `String(now())` (build-timestamp fallback,
for git-less containers). SHAs are truncated to 7 chars for compactness.

### `vite-plugin-version.ts`

A Vite `Plugin` that does exactly three things:

1. **`config()`** → return `{ define: { __APP_VERSION__: JSON.stringify(token) } }`.
   Token computed once via `resolveVersion(process.env)`.
2. **`generateBundle()`** → `this.emitFile({ type: "asset", fileName: "version.json",
   source: JSON.stringify({ version: token }) })`. Lands at the output root, served
   at `/version.json`.
3. **`configureServer(server)`** → middleware answering `GET /version.json` with the
   same token (so dev doesn't 404; same token ⇒ no dev nag).

Registered in `vite.config.ts` `plugins: [...]`. Order is not load-bearing.

### `use-version-available.ts`

```ts
function useVersionAvailable(opts?: {
  url?: string;          // default "/version.json"
  intervalMs?: number;   // default 60_000
  enabled?: boolean;     // default !import.meta.env.DEV (no nag while developing)
}): { updateReady: boolean; latestVersion: string | null; dismiss: () => void }
```

**Boot:** `current = __APP_VERSION__` (read once into a ref).

**Poll triggers** (deploys are rare ⇒ cheap, no busy-loop):
- `visibilitychange` when the tab becomes visible — **primary trigger** (laptop-wake,
  tab-return, "came back after lunch").
- `focus` on the window.
- `setInterval(intervalMs)` **only while the tab is visible** — backstop for a tab
  left open + foreground. Cleared on hide, re-armed on show.
- One check shortly after mount (catches a deploy landing between SSR and hydration).

Never polls a hidden tab.

**Compare + dismiss:**
```
fetched = json.version
updateReady = fetched !== current && fetched !== dismissedRef.current
dismiss() → dismissedRef.current = latestVersion
```
Dismiss suppresses **only that token**. A *newer* deploy ⇒ new token ⇒ re-flags.
State is an in-memory ref (no localStorage) — portable, and a real reload moots it.

**Error handling — silence is the rule:**
- `fetch` throws (offline), non-200 (a 404 served mid-deploy, CDN blip), or
  unparseable JSON → swallow, leave state untouched. **Never toast on error.**
- One `AbortController` per poll; abort the in-flight request on a new trigger or on
  unmount → no setState-after-unmount, no out-of-order race.
- Fetch is `cache: "no-store"` and the URL carries a `?t=<Date.now()>` cache-buster
  → bypasses browser bfcache **and** most CDN edge caches (the one real failure mode,
  see Risks).

**Dev:** `enabled` defaults to `!import.meta.env.DEV` → zero toasts while developing.
Pass `enabled: true` to exercise it live.

### `version-toast.tsx`

Renders `null`. Calls `useVersionAvailable()` and, when `updateReady` flips true,
fires the sonner toast once (guarded by a `shownRef`; the stable `id` also makes
re-calls idempotent):

```ts
toast("New version available", {
  id: "app-version",
  description: "Reload to get the latest.",
  duration: Number.POSITIVE_INFINITY,
  action: { label: "Reload", onClick: () => window.location.reload() },
  onDismiss: dismiss,
});
```

## Toast UI + theming

- **Install:** `npx shadcn@latest add sonner` → generates `src/components/ui/sonner.tsx`,
  adds `sonner` + `next-themes` to deps.
- **Adapt:** the app is **dark-only** and does not use `next-themes`. Remove the
  `useTheme()` import and the `next-themes` dependency; hardcode `theme="dark"`.
  Net new runtime dep = **`sonner` only**.
- **Theme to Liquid Glass** via sonner's CSS custom properties on `toastOptions`
  (frosted-pane recipe from the design system):
  - `--normal-bg: var(--glass)` + `backdrop-blur-xl`
  - `--normal-text: var(--ink)`
  - `--normal-border: rgba(255,255,255,0.1)` + bright top-edge inset shadow
  - action button = violet pill (`var(--primary)`)
  - position bottom-right.
- **Mounts** in `src/routes/__root.tsx`:
  - `<Toaster />` in `RootDocument` body (sonner SSRs to nothing; client portal).
  - `<VersionToast />` inside the existing `<ClientOnly fallback={null}>` next to
    `<CardOverlay />` — guarantees the hook never executes during SSR/prerender.

## Testing

Bun runner + happy-dom. Mock fetch with `spyOn(globalThis, "fetch")` — **not**
`mock.module` (it poisons later test files in this worktree). No corpus pre-seed
needed (no card grids rendered).

- **`resolve-version.test.ts`** — env precedence
  (`APP_VERSION → VERCEL_ → CF_ → GITHUB_ → git → timestamp`) via injected fake env +
  fake `runGit` + fake `now`. SHA truncation to 7 chars.
- **`use-version-available.test.ts`** (fake timers):
  - changed token → `updateReady` true; same token → false.
  - fetch reject → stays false; 404 → stays false (never toast on error).
  - `dismiss()` → suppressed until a newer token → re-flags.
  - `visibilitychange` / `focus` re-trigger a poll.
  - interval fires only while visible; cleared on hide.
  - abort on unmount → no setState warning.
  - `enabled: false` → never fetches.
- **`version-toast.test.tsx`** — spy `sonner.toast`; drive via mocked fetch; assert it
  is called with the `Reload` action and `duration: Infinity`.
- **Vite plugin** — not unit-tested directly (integration-heavy); its pure core
  (`resolve-version`) is fully covered. **Accepted deviation.**

## Portability deliverable — `src/lib/version-check/README.md`

The README is what ends the rebuild cycle. Steps to reuse in another Vite + React app:

1. Copy `src/lib/version-check/` into the new project.
2. Register the plugin in `vite.config.ts`, importing it **directly** from
   `version-check/vite-plugin-version` (not the barrel): `plugins: [versionPlugin(), …]`.
3. `__APP_VERSION__` decl travels in `version-check.d.ts` — ensure it is covered by
   the project's `tsconfig` `include`.
4. Mount `<Toaster />` (sonner) once + `<VersionToast />` in the root layout.
5. `bun add sonner` (next-themes not required after the dark-only adaptation).

Notes: the hook is plain React → any Vite + React app. Non-Vite builds swap only the
plugin (anything that stamps the token + serves `version.json`). Static hosts should
also send `Cache-Control: no-cache` on `/version.json`; the client cache-buster makes
this belt-and-suspenders, not strictly required.

## Risks / edge cases

- **CDN edge-caching `/version.json`** — the one real failure mode. An aggressive CDN
  could serve a stale file to the polling client, so a new deploy is never seen.
  Mitigated by the `?t=<now>` cache-buster (unique URL per poll) + `cache:"no-store"`.
  README documents the `Cache-Control: no-cache` header as a second layer, and the
  Nitro no-cache route as a guaranteed-fresh alternative on this stack.
- **Deploy in flight** — `/version.json` may 404 or flap for a beat during a deploy.
  The "never toast on error" rule means this is a no-op; the next poll recovers.
- **Token equals across unrelated rebuilds** — using a git SHA, an identical tree
  rebuilt yields the same token (correct: same code = not stale). The timestamp
  fallback only triggers when no SHA source exists.
- **Manual memoization** — the hook uses `useCallback`/`useRef` by hand; React
  Compiler is on but the codebase memoizes manually (accepted, per CLAUDE.md).

## File-change summary

**New:**
- `src/lib/version-check/resolve-version.ts`
- `src/lib/version-check/vite-plugin-version.ts`
- `src/lib/version-check/use-version-available.ts`
- `src/lib/version-check/version-toast.tsx`
- `src/lib/version-check/version-check.d.ts`
- `src/lib/version-check/index.ts`
- `src/lib/version-check/README.md`
- `src/lib/version-check/resolve-version.test.ts`
- `src/lib/version-check/use-version-available.test.ts`
- `src/lib/version-check/version-toast.test.tsx`
- `src/components/ui/sonner.tsx` (shadcn add, adapted)

**Modified:**
- `vite.config.ts` — register the version plugin.
- `src/routes/__root.tsx` — mount `<Toaster />` + `<VersionToast />`.
- `package.json` — add `sonner` (strip `next-themes` if the shadcn add pulled it in).

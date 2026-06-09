# version-check

Toast the user when a newer build has been deployed. Poll-based, no service worker.

## How it works

A Vite plugin stamps a build token two ways:

- **frozen** into the client bundle as `__APP_VERSION__`,
- **live** into an emitted `/version.json`.

`useVersionAvailable()` polls `/version.json` on focus / visibility / interval and
flags staleness when the served token differs from the booted one. `<VersionToast/>`
renders that as a sonner toast with a manual **Reload** action (never auto-reloads).

## Drop into another Vite + React app

1. Copy this folder.
2. Register the plugin (import **directly**, not via the barrel — it pulls in
   `node:child_process`):
   ```ts
   // vite.config.ts
   import { versionPlugin } from "./src/lib/version-check/vite-plugin-version";
   export default defineConfig({ plugins: [versionPlugin()] });
   ```
3. Ensure `version-check.d.ts` is covered by your tsconfig `include`. If your app
   tsconfig lacks Node types, exclude `vite-plugin-version.ts` from it and add the
   file to a Node-typed tsconfig (this repo does exactly that in
   `tsconfig.app.json` / `tsconfig.node.json`).
4. Mount once in your root layout (client-only):
   ```tsx
   import { Toaster } from "@/components/ui/sonner";
   import { VersionToast } from "@/lib/version-check";
   // ... <VersionToast /> <Toaster />
   ```
5. `bun add sonner`.

## Token source

`resolve-version.ts` resolves, first non-empty wins: `APP_VERSION` →
`VERCEL_GIT_COMMIT_SHA` → `CF_PAGES_COMMIT_SHA` → `GITHUB_SHA` → local
`git rev-parse --short HEAD` → build timestamp.

## Caching note

The client fetches `/version.json?t=<now>` with `cache: "no-store"` to dodge the
browser cache and most CDNs. On an aggressive CDN, also send `Cache-Control:
no-cache` on `/version.json`, or serve it from a no-cache server route.

## Options

`useVersionAvailable({ url?, intervalMs?, enabled? })` — defaults `/version.json`,
`60_000` ms, and on outside dev (`!import.meta.env.DEV`). The interval only runs
while the tab is visible.

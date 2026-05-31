# TanStack Start Migration — Plan 01: Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a TanStack Start app that server-renders a placeholder home page, builds to a Nitro Node output, and runs under `node .output/server/index.mjs` — with the old SPA entry removed and all tooling (Bun test, Biome, tsc) green.

**Architecture:** Big-bang on the `migrate/tanstack-start` branch. This plan installs the framework *alongside* the existing source: old `pages/`, `hooks/`, `components/`, `store/` files stay on disk, unreferenced by the new route tree, and keep compiling (so `react-router` stays installed until Plan 04 migrates the last importer). Only the *entry* flips — `main.tsx` + `index.html` are deleted; the new entry is `src/router.tsx` + `src/routes/__root.tsx` with the document shell. Routing data, real pages, islands, PWA, and deploy come in Plans 02–05.

**Tech Stack:** TanStack Start (`@tanstack/react-start` + `@tanstack/react-router`), Nitro (`nitro/vite`), Vite 8, React 19 + React Compiler, Tailwind v4 (`@tailwindcss/vite`), Bun (pkg manager + `bun test`), Biome.

**Watch-points (flag to executor):** (1) React Compiler now wired via `viteReact({ babel })` not `@rolldown/plugin-babel`; (2) Tailwind v4 plugin coexisting with `tanstackStart()`; (3) `routeTree.gen.ts` is auto-generated on first `vite dev`/`vite build` — do not hand-write it, do `.gitignore` it.

---

### Task 1: Dependencies + Vite/scripts configuration

**Files:**
- Modify: `package.json` (deps + scripts)
- Modify: `vite.config.ts` (full rewrite)
- Modify: `.gitignore` (add `routeTree.gen.ts`, `.output`, `.nitro`)

- [ ] **Step 1: Add TanStack Start + Nitro deps, remove the old Babel plugin**

Run:
```bash
bun add @tanstack/react-start @tanstack/react-router nitro
bun remove @rolldown/plugin-babel
```
Expected: installs succeed; `react-router` and `vite-plugin-pwa` remain (still used by unreferenced legacy files / re-added in Plan 05).

- [ ] **Step 2: Rewrite `vite.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	server: { port: 3000 },
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	plugins: [
		tailwindcss(),
		tanstackStart({ srcDirectory: "src" }),
		viteReact({ babel: { plugins: ["babel-plugin-react-compiler"] } }),
		nitro(),
	],
});
```

Note: `base` subpath is gone (served at domain root, not `/pokemon-tcg-viewer/`). `vite-plugin-pwa` is intentionally dropped here and re-added in Plan 05.

- [ ] **Step 3: Update `package.json` scripts**

Set the `scripts` block to:
```json
{
	"dev": "vite dev",
	"build": "vite build",
	"start": "node .output/server/index.mjs",
	"test": "bun test",
	"typecheck": "tsc -b",
	"lint": "biome check",
	"format": "biome check --write --unsafe",
	"typecheck:worker": "tsc -p worker/tsconfig.json",
	"deploy:worker": "cd worker && bunx wrangler deploy"
}
```

- [ ] **Step 4: Ignore generated artifacts**

Append to `.gitignore`:
```
# TanStack Start / Nitro
src/routeTree.gen.ts
.output
.nitro
```

- [ ] **Step 5: Verify install resolves**

Run: `bun install`
Expected: exits 0, lockfile updates with `@tanstack/react-start`, `@tanstack/react-router`, `nitro`.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock vite.config.ts .gitignore
git commit -m "build(migrate): install TanStack Start + Nitro, rewrite vite config"
```

---

### Task 2: Router, root document shell, and index route (SSR boots)

**Files:**
- Create: `src/router.tsx`
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`

- [ ] **Step 1: Create `src/router.tsx`**

```tsx
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
	return createTanStackRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createRouter>;
	}
}
```

Note: `./routeTree.gen` does not exist yet — it is generated on first `vite build` (Step 4). The TypeScript error until then is expected.

- [ ] **Step 2: Create `src/routes/__root.tsx`** (document shell + global stylesheet)

```tsx
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../app.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Pokémon TCG Holo Playground" },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
```

- [ ] **Step 3: Create `src/routes/index.tsx`** (placeholder home, exported for testing)

```tsx
import { createFileRoute } from "@tanstack/react-router";

export function HomePlaceholder() {
	return (
		<main className="p-8">
			<h1 className="text-2xl font-bold">Pokémon TCG — Holo Playground</h1>
			<p className="text-muted-foreground">SSR scaffold is live.</p>
		</main>
	);
}

export const Route = createFileRoute("/")({
	component: HomePlaceholder,
});
```

- [ ] **Step 4: Build (generates `routeTree.gen.ts` + Nitro output)**

Run: `bun run build`
Expected: exits 0; `src/routeTree.gen.ts` now exists; `.output/server/index.mjs` exists.

- [ ] **Step 5: Verify SSR — the HTML contains server-rendered text**

Run:
```bash
node .output/server/index.mjs &
SERVER_PID=$!
sleep 2
curl -s http://localhost:3000/ | grep -q "SSR scaffold is live" && echo "SSR OK"
kill $SERVER_PID
```
Expected: prints `SSR OK` (the `<h1>`/`<p>` text is in the raw HTML, proving server render — not a client-only shell).

- [ ] **Step 6: Commit**

```bash
git add src/router.tsx src/routes/__root.tsx src/routes/index.tsx
git commit -m "feat(migrate): TanStack Start router, root shell, index route (SSR)"
```

---

### Task 3: Remove the old SPA entry

**Files:**
- Delete: `src/main.tsx`
- Delete: `index.html`

- [ ] **Step 1: Delete the old entry files**

Run:
```bash
git rm src/main.tsx index.html
```
Expected: both removed. (Legacy `pages/`, `hooks/`, `root-layout.tsx`, etc. remain on disk — they are migrated in later plans.)

- [ ] **Step 2: Rebuild to confirm the Start entry stands alone**

Run: `bun run build`
Expected: exits 0; `.output/server/index.mjs` rebuilt. (The legacy files are not in the route tree, so they are not bundled into the app — but they still type-check because `react-router` is installed.)

- [ ] **Step 3: Verify SSR still serves**

Run:
```bash
node .output/server/index.mjs &
SERVER_PID=$!
sleep 2
curl -s http://localhost:3000/ | grep -q "SSR scaffold is live" && echo "SSR OK"
kill $SERVER_PID
```
Expected: prints `SSR OK`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(migrate): drop old SPA entry (main.tsx, index.html)"
```

---

### Task 4: Index route render test + full verification gate

**Files:**
- Create: `src/routes/index.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { HomePlaceholder } from "./index";

test("HomePlaceholder renders the scaffold heading", () => {
	render(<HomePlaceholder />);
	expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
		"Holo Playground",
	);
	expect(screen.getByText("SSR scaffold is live.")).toBeDefined();
});
```

- [ ] **Step 2: Run it — expect PASS** (the component already exists from Task 2)

Run: `bun test src/routes/index.test.tsx`
Expected: 1 pass. (This test guards against the scaffold component regressing; it is the seed for real home-page tests in Plan 03.)

- [ ] **Step 3: Run the full verification gate in parallel**

Run (single batch):
```bash
bun run typecheck
bun run lint
bun test
```
Expected: `typecheck` exits 0; `biome check` reports no errors (run `biome check --config-path=. src` if a worktree nested-config error appears — see project memory); `bun test` — all suites pass. Legacy tests that import `react-router` still pass because the dep is installed.

- [ ] **Step 4: Update README stack line**

In `README.md`, under `## Stack`, replace the `React Router 7` and `Vite 8 for dev/build` lines with:
```markdown
* TanStack Start (SSR) + TanStack Router — Nitro Node server
* Vite 8 (via the TanStack Start plugin)
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/index.test.tsx README.md
git commit -m "test(migrate): index route render test + update README stack"
```

---

## Self-review

- **Spec coverage:** Plan 01 = "Scaffold" subsystem from `map.md` (the `__root` shell, `router.tsx`, build-to-Nitro, drop old entry, drop `basename`). The other `map.md` rows are explicitly scoped to Plans 02–05. ✅
- **Placeholders:** none — every step has real code or a real command + expected output.
- **Type consistency:** `HomePlaceholder` defined in Task 2, imported in Task 4. `createRouter` return type registered via module augmentation in Task 1's file. `routeTree` import flagged as generated-on-build.
- **Risk:** the SSR `curl` checks (Tasks 2 & 3) are the real proof-of-life; if they fail, the React-Compiler-via-`viteReact` wiring (watch-point 1) is the first suspect.

---

## Roadmap — Plans 02–05 (written when reached)

Each produces working, testable software on its own.

- **Plan 02 — Server data seam.** `lib/slug.ts` (pure, full TDD: `slugify` + collision-safe `buildSlugMap` + `resolve*`), extend `scripts/build-corpus.ts` to emit the `slug↔id` map, `server/card-data.ts` (move `api.ts` fetches server-side, key from env — `sec-sensitive-data`), `server/cache-headers.ts` (the `goals.md` SWR matrix via `setResponseHeaders`). *Produces:* server can fetch + slug-resolve sets/cards, unit-tested. No UI yet.
- **Plan 03 — Route tree + SSR pages.** `__root` series loader + sidebar; `index` + home; `$series/index` (booster packs); `$set/route`+`index` (cards SSR + per-set facets); `$card` (loader + OG `head()` + SWR headers); `search`; `pokemon/$name` (new SEO entity). *Produces:* every page crawlable, correct SSR HTML + OG. `ssr-prerender` for series.
- **Plan 04 — Islands + interactivity.** Hydrate holo/grid/dialog/search/filters; seed `useCards` client cache from loader data; collection/recents/corpus client-only with `ssr-hydration-safety`; `$card` dialog↔page parity. Remove `react-router` once the last importer is migrated. *Produces:* full interactive parity with the old SPA.
- **Plan 05 — PWA + deploy.** Service worker under SSR (resolve `vite-plugin-pwa` vs Nitro-served SW), the drafted nginx server block, systemd unit, GitHub Actions self-hosted runner. *Produces:* deployed + push-to-deploy on the home server.

# Design Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Pokémon TCG viewer to shadcn/ui + Tailwind v4 with a unified single-page shell (toolbar + sidebar + search/filters + one infinite grid), card & pack detail as route-as-modal dialogs — preserving the holo system, worker-proxied API, URL-driven state, and Zustand+IndexedDB store.

**Architecture:** Persistent `RootLayout` shell (toolbar + left sidebar + `<Outlet/>`). A pathless `BrowsePage` layout route renders the browse UI (search/filters + `VirtuosoGrid`/timeline) plus its own `<Outlet/>`; `/card/:id` and `/pack/:setId` are children of that layout, so they render as dialogs over a still-mounted grid (native data-router modal pattern — no `state.background` hack). Deep-links, the card loader, prefetch, and the back button all keep working.

**Tech Stack:** Vite 8, React 19, React Router 7 (data router), Tailwind v4 (`@tailwindcss/vite`), shadcn/ui (new-york, unified `radix-ui`), Zustand + IndexedDB, react-virtuoso, Bun test runner (happy-dom).

**Spec:** [docs/superpowers/specs/2026-05-30-design-revamp-design.md](../specs/2026-05-30-design-revamp-design.md)

---

## File Structure

**New files**
- `src/lib/utils.ts` — shadcn `cn` helper.
- `src/components/ui/*` — installed shadcn components (button, input, dialog, dropdown-menu, popover, select, badge, scroll-area, separator, sheet, skeleton, tooltip, command, collapsible).
- `src/utils/pick-newest-set.ts` (+ test) — newest-set-by-releaseDate selector.
- `src/utils/card-colors.ts` (+ test) — borrowed `getTypeColor` / `getRarityColor`.
- `src/components/app-shell/toolbar.tsx` — top toolbar.
- `src/components/series-sidebar/series-sidebar.tsx` — vertical series→sets navigator.
- `src/components/series-sidebar/series-sidebar-item.tsx` — one expandable series row.
- `src/components/search-bar/search-bar.tsx` — search input + species autocomplete + filter bar.
- `src/components/search-bar/filter-popover.tsx` — one filter dimension (multi-select popover).
- `src/components/card-dialog/card-dialog.tsx` — rich 2-col card detail dialog.
- `src/components/card-dialog/price-lines.ts` — `buildPriceLines` (moved from card-page).
- `src/components/pack-dialog/pack-dialog.tsx` — pack rip/reveal dialog (reuses roll logic).
- `src/pages/browse-page.tsx` — pathless layout merging sets-page + pokemon-page + dialog outlet.

**Modified**
- `vite.config.ts` — add `@tailwindcss/vite` plugin + `@/` alias.
- `tsconfig.app.json` — add `baseUrl` + `paths`.
- `src/app.css` — Tailwind import + deep-purple theme tokens (replaces hand-rolled CSS).
- `src/main.tsx` — new route table (pathless browse layout + dialog children).
- `src/root-layout.tsx` — becomes the shell (toolbar + sidebar + Outlet).
- `src/api.ts` — no change Phase 1–4 (color helpers live in `utils/card-colors.ts`).
- `src/components/card-grid.tsx` — card click navigates to `/card/:id`.
- `src/components/cross-link-overlay` consumers — retarget `/pokemon?q=` → `/?q=`.

**Removed / migrated**
- `src/pages/card-page.tsx` + `card-page.css` → `card-dialog/`.
- `src/pages/pack-page.tsx` + `pack-page.css` → `pack-dialog/`.
- `src/pages/sets-page.tsx`, `src/pages/pokemon-page.tsx` → `browse-page.tsx`.
- `src/components/header.tsx` + `header.css`.
- `src/components/series-menu/*`.
- `src/components/filter-chip-row/*` (re-skinned into `search-bar/`).
- `components.json` (new, shadcn config).

**Preserved untouched:** `src/components/holo-card/*`, `src/store/*`, `src/hooks/*`, `src/utils/{roll-pack,build-filter-clauses,escape-lucene,group-sets-by-series,pokemon-name,display-name}.ts`, `src/components/{booster-pack,pokemon-timeline,view-mode-toggle,cross-link-overlay,collection-toggle,install-prompt,offline-indicator}`, PWA config.

**Deleted at the end:** `design-ref/` (never committed).

**Conventions for this plan**
- Unit tests run with `bun test <path>` (happy-dom + fake-indexeddb, see `src/test-setup.ts`).
- Lint a single file: `bunx biome check --config-path=. <path>` (avoids the nested-config issue). Format-fix: `bunx biome check --write <path>`.
- Typecheck: `bun run typecheck`.
- Visual verification uses the `preview` build (port 4173, base `/pokemon-tcg-viewer/`), not the dev server.
- shadcn `ui/` files are generated — exempt from the `interface`-over-`type` preference; do not hand-edit beyond import-path fixes.

---

## Phase 1 — Tooling & theme

### Task 1: Install dependencies

**Files:** `package.json` (via bun)

- [ ] **Step 1: Add runtime + dev deps**

```bash
bun add tailwindcss @tailwindcss/vite radix-ui class-variance-authority clsx tailwind-merge lucide-react
bun add -d tw-animate-css
```

- [ ] **Step 2: Verify install**

Run: `bun pm ls | grep -E "tailwindcss|radix-ui|lucide-react|tailwind-merge"`
Expected: all four resolve to installed versions.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "build: add tailwind v4, shadcn, radix-ui deps"
```

### Task 2: Wire Tailwind plugin + `@/` alias into Vite

**Files:** Modify `vite.config.ts`

- [ ] **Step 1: Edit `vite.config.ts`** — add the import, the plugin (first in the list), and a `resolve.alias`.

Add at top with the other imports:

```ts
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
```

In the returned config object add (sibling of `base`, `server`, `plugins`):

```ts
resolve: {
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
  },
},
```

In `plugins: [...]` make `tailwindcss()` the **first** entry, before `react()`:

```ts
plugins: [
  tailwindcss(),
  react(),
  babel({ presets: [reactCompilerPreset()] }),
  VitePWA({ /* unchanged */ }),
],
```

- [ ] **Step 2: Verify the dev server still boots**

Run: `bun run dev` (let it start, then Ctrl-C)
Expected: Vite starts with no plugin/resolve errors.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "build: add @tailwindcss/vite plugin and @/ alias"
```

### Task 3: Add path alias to TypeScript

**Files:** Modify `tsconfig.app.json`

- [ ] **Step 1: Add `baseUrl` + `paths`** to `compilerOptions` (after `"jsx": "react-jsx",`):

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] },
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bun run typecheck`
Expected: no errors (no `@/` imports exist yet; this just registers the mapping).

- [ ] **Step 3: Commit**

```bash
git add tsconfig.app.json
git commit -m "build: map @/* to src/* for TypeScript"
```

### Task 4: Replace `app.css` with Tailwind + deep-purple theme tokens

**Files:** Modify `src/app.css`

- [ ] **Step 1: Replace the entire file** with the Tailwind import + retuned deep-purple tokens. (These oklch values are a brand-aligned starting point; fine-tune at the visual-verify step.)

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(0.12 0.04 290);
  --foreground: oklch(0.95 0.012 290);
  --card: oklch(0.16 0.04 290);
  --card-foreground: oklch(0.95 0.012 290);
  --popover: oklch(0.15 0.04 290);
  --popover-foreground: oklch(0.95 0.012 290);
  --primary: oklch(0.62 0.22 295);
  --primary-foreground: oklch(0.98 0.01 290);
  --secondary: oklch(0.22 0.04 290);
  --secondary-foreground: oklch(0.92 0.012 290);
  --muted: oklch(0.2 0.03 290);
  --muted-foreground: oklch(0.68 0.03 290);
  --accent: oklch(0.72 0.14 200);
  --accent-foreground: oklch(0.14 0.03 290);
  --destructive: oklch(0.58 0.22 25);
  --destructive-foreground: oklch(0.98 0.01 290);
  --border: oklch(0.27 0.03 290);
  --input: oklch(0.24 0.03 290);
  --ring: oklch(0.62 0.22 295);
  --radius: 0.75rem;
  --sidebar: oklch(0.14 0.04 290);
  --sidebar-foreground: oklch(0.95 0.012 290);
  --sidebar-primary: oklch(0.62 0.22 295);
  --sidebar-primary-foreground: oklch(0.98 0.01 290);
  --sidebar-accent: oklch(0.22 0.04 290);
  --sidebar-accent-foreground: oklch(0.92 0.012 290);
  --sidebar-border: oklch(0.27 0.03 290);
  --sidebar-ring: oklch(0.62 0.22 295);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html, body, #root {
    margin: 0;
    padding: 0;
    height: 100%;
  }
  body {
    @apply bg-background text-foreground;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
}
```

> Note: the old `.primary-nav*` / `.app` rules are intentionally dropped here — `root-layout.tsx` is rebuilt with Tailwind in Phase 2. The app will look broken until Phase 2 lands; that is expected.

- [ ] **Step 2: Verify build compiles the CSS**

Run: `bun run dev` (start, confirm no Tailwind parse error in console, Ctrl-C)
Expected: dev server boots; Tailwind processes `app.css` without error.

- [ ] **Step 3: Commit**

```bash
git add src/app.css
git commit -m "feat(theme): tailwind v4 import + deep-purple oklch tokens"
```

### Task 5: Add shadcn config + `cn` helper

**Files:** Create `components.json`, `src/lib/utils.ts`

- [ ] **Step 1: Create `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 2: Create `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components.json src/lib/utils.ts
git commit -m "build: shadcn config + cn helper"
```

### Task 6: Install shadcn components

**Files:** Create `src/components/ui/*`

- [ ] **Step 1: Add the component set**

```bash
bunx --bun shadcn@latest add button input dialog dropdown-menu popover select badge scroll-area separator sheet skeleton tooltip command collapsible
```

If the CLI prompts about overwriting `app.css` or base color, decline overwriting `app.css` (keep ours from Task 4).

- [ ] **Step 2: Verify imports use the unified `radix-ui` package**

Run: `grep -rl "@radix-ui/react-" src/components/ui || echo "all unified"`
Expected: `all unified`. If any file lists individual `@radix-ui/react-*` imports, rewrite them to import from `radix-ui` (e.g. `import * as DialogPrimitive from "radix-ui"` per shadcn's unified pattern) and remove the individual deps. Re-run until it prints `all unified`.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui package.json bun.lock
git commit -m "feat(ui): install shadcn component set (unified radix-ui)"
```

---

## Phase 2 — Shell, sidebar, unified browse

### Task 7: `pickNewestSetId` selector (TDD)

**Files:** Create `src/utils/pick-newest-set.ts`, `src/utils/pick-newest-set.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import type { PokemonSet } from "../api";
import { pickNewestSetId } from "./pick-newest-set";

const make = (id: string, releaseDate: string): PokemonSet => ({
  id,
  name: id,
  series: "S",
  releaseDate,
  total: 1,
  images: { symbol: "", logo: "" },
});

describe("pickNewestSetId", () => {
  it("returns the id of the set with the latest releaseDate", () => {
    const sets = [
      make("base1", "1999/01/09"),
      make("sv8", "2024/11/08"),
      make("swsh1", "2020/02/07"),
    ];
    expect(pickNewestSetId(sets)).toBe("sv8");
  });

  it("returns null for an empty list", () => {
    expect(pickNewestSetId([])).toBeNull();
  });

  it("breaks ties deterministically by id", () => {
    const sets = [make("b", "2024/01/01"), make("a", "2024/01/01")];
    expect(pickNewestSetId(sets)).toBe("a");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test src/utils/pick-newest-set.test.ts`
Expected: FAIL — `pickNewestSetId` is not defined.

- [ ] **Step 3: Implement**

```ts
import type { PokemonSet } from "../api";

/**
 * Id of the set with the latest releaseDate. pokemontcg.io dates are
 * zero-padded `YYYY/MM/DD`, so lexicographic compare == chronological.
 * Ties (same date) break to the lexicographically smaller id for
 * deterministic default selection. Returns null for an empty list.
 */
export function pickNewestSetId(sets: PokemonSet[]): string | null {
  let best: PokemonSet | null = null;
  for (const s of sets) {
    if (
      !best ||
      s.releaseDate > best.releaseDate ||
      (s.releaseDate === best.releaseDate && s.id < best.id)
    ) {
      best = s;
    }
  }
  return best?.id ?? null;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun test src/utils/pick-newest-set.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/pick-newest-set.ts src/utils/pick-newest-set.test.ts
git commit -m "feat(browse): newest-set selector"
```

### Task 8: Series sidebar — one expandable series row

**Files:** Create `src/components/series-sidebar/series-sidebar-item.tsx`

- [ ] **Step 1: Implement the item** (uses shadcn `Collapsible`; fixes the symbol-size bug with a fixed 20px box).

```tsx
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { PokemonSet } from "../../api";

interface SeriesSidebarItemProps {
  series: string;
  sets: PokemonSet[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSetId: string | null;
  onSelect: (setId: string) => void;
}

export function SeriesSidebarItem({
  series,
  sets,
  open,
  onOpenChange,
  selectedSetId,
  onSelect,
}: SeriesSidebarItemProps) {
  const hasSelected = sets.some((s) => s.id === selectedSetId);
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
          hasSelected
            ? "text-primary"
            : "text-foreground hover:bg-secondary",
        )}
      >
        <ChevronRight
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")}
        />
        <span className="flex-1 truncate">{series}</span>
        <span className="text-xs text-muted-foreground">{sets.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-4 border-l border-border pl-3">
        {sets.map((set) => (
          <button
            key={set.id}
            type="button"
            onClick={() => onSelect(set.id)}
            aria-current={set.id === selectedSetId ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              set.id === selectedSetId
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <span className="flex size-5 shrink-0 items-center justify-center">
              <img
                src={set.images.symbol}
                alt=""
                className="max-h-5 max-w-5 object-contain"
              />
            </span>
            <span className="flex-1 truncate">{set.name}</span>
            <span className="text-xs opacity-70">{set.total}</span>
          </button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. src/components/series-sidebar/series-sidebar-item.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/series-sidebar/series-sidebar-item.tsx
git commit -m "feat(sidebar): expandable series row with fixed-size symbol"
```

### Task 9: Series sidebar container

**Files:** Create `src/components/series-sidebar/series-sidebar.tsx`

- [ ] **Step 1: Implement** — groups sets by series (reuse `groupSetsBySeries`), auto-expands the series holding the selected set, writes `setId` to the URL via `useSetIdParam`.

```tsx
import { Layers } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSets } from "../../hooks/use-sets";
import { useSetIdParam } from "../../hooks/use-url-selection";
import { groupSetsBySeries } from "../../utils/group-sets-by-series";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SeriesSidebarItem } from "./series-sidebar-item";

interface SeriesSidebarProps {
  /** Called after a set is chosen (e.g. to close the mobile sheet). */
  onAfterSelect?: () => void;
}

export function SeriesSidebar({ onAfterSelect }: SeriesSidebarProps) {
  const sets = useSets();
  const [selectedSetId, setSelectedSetId] = useSetIdParam();
  const groups = useMemo(() => groupSetsBySeries(sets), [sets]);

  const selectedSeries = useMemo(
    () => sets.find((s) => s.id === selectedSetId)?.series ?? null,
    [sets, selectedSetId],
  );
  const [openSeries, setOpenSeries] = useState<string | null>(null);

  // Auto-expand the series containing the selected set as it resolves.
  useEffect(() => {
    if (selectedSeries) setOpenSeries(selectedSeries);
  }, [selectedSeries]);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-0.5 p-3">
        <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="size-4" />
          Series & Sets
        </div>
        {groups.map(({ series, sets: seriesSets }) => (
          <SeriesSidebarItem
            key={series}
            series={series}
            sets={seriesSets}
            open={openSeries === series}
            onOpenChange={(open) => setOpenSeries(open ? series : null)}
            selectedSetId={selectedSetId}
            onSelect={(id) => {
              setSelectedSetId(id);
              onAfterSelect?.();
            }}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. src/components/series-sidebar/series-sidebar.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/series-sidebar/series-sidebar.tsx
git commit -m "feat(sidebar): series navigator container"
```

### Task 10: Toolbar

**Files:** Create `src/components/app-shell/toolbar.tsx`

- [ ] **Step 1: Implement** — logo, current-set context, Open Packs (→ `/pack/:selectedSetId`), Collection link, offline + install, mobile sidebar toggle (via `Sheet`).

```tsx
import { Menu, Package, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSets } from "../../hooks/use-sets";
import { useSetIdParam } from "../../hooks/use-url-selection";
import { InstallPrompt } from "../install-prompt";
import { OfflineIndicator } from "../offline-indicator";
import { SeriesSidebar } from "../series-sidebar/series-sidebar";

export function Toolbar() {
  const sets = useSets();
  const [selectedSetId] = useSetIdParam();
  const navigate = useNavigate();
  const currentSet = sets.find((s) => s.id === selectedSetId);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open sidebar">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Series & sets</SheetTitle>
            <SeriesSidebar />
          </SheetContent>
        </Sheet>
        <Sparkles className="size-6 shrink-0 text-primary" />
        <Link to="/" className="hidden text-lg font-bold sm:block">
          Pokémon TCG Holo Playground
        </Link>
        {currentSet && (
          <div className="hidden min-w-0 items-center gap-2 border-l border-border pl-3 md:flex">
            <img src={currentSet.images.logo} alt="" className="h-7 object-contain" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{currentSet.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {currentSet.series} · {currentSet.total} cards
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <OfflineIndicator />
        <InstallPrompt />
        <Button
          variant="outline"
          disabled={!selectedSetId}
          onClick={() => selectedSetId && navigate(`/pack/${selectedSetId}`)}
        >
          <Package className="size-4 sm:mr-2" />
          <span className="hidden sm:inline">Open Packs</span>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/collection">Collection</Link>
        </Button>
      </div>
    </header>
  );
}
```

> If `OfflineIndicator` / `InstallPrompt` render their own buttons that clash visually, wrap them or restyle in Phase 5; keep them functional here.

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. src/components/app-shell/toolbar.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/app-shell/toolbar.tsx
git commit -m "feat(shell): top toolbar"
```

### Task 11: Rebuild `RootLayout` as the shell

**Files:** Modify `src/root-layout.tsx`

- [ ] **Step 1: Replace the file** — toolbar + persistent desktop sidebar + main `<Outlet/>`.

```tsx
import { Outlet, ScrollRestoration } from "react-router";
import "./app.css";
import { Toolbar } from "./components/app-shell/toolbar";
import { SeriesSidebar } from "./components/series-sidebar/series-sidebar";

export function RootLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ScrollRestoration />
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-sidebar lg:block">
          <SeriesSidebar />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS (BrowsePage not wired yet, but RootLayout itself compiles).

- [ ] **Step 3: Commit**

```bash
git add src/root-layout.tsx
git commit -m "feat(shell): root layout = toolbar + sidebar + outlet"
```

### Task 12: Filter popover (one dimension)

**Files:** Create `src/components/search-bar/filter-popover.tsx`

- [ ] **Step 1: Implement** — a multi-select popover backed by a `useFilterParam` dimension.

```tsx
import { Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useFilterParam } from "../../hooks/use-url-selection";

interface FilterPopoverProps {
  label: string;
  paramName: string;
  options: string[];
}

export function FilterPopover({ label, paramName, options }: FilterPopoverProps) {
  const [active, setActive] = useFilterParam(paramName);

  const toggle = (value: string) => {
    setActive(
      active.includes(value)
        ? active.filter((v) => v !== value)
        : [...active, value],
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={active.length ? "default" : "outline"} size="sm" disabled={!options.length}>
          {label}
          {active.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {active.length}
            </Badge>
          )}
          <ChevronDown className="ml-1 size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <ScrollArea className="max-h-72">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
            >
              <Check className={cn("size-4", active.includes(opt) ? "opacity-100" : "opacity-0")} />
              <span className="flex-1 truncate">{opt}</span>
            </button>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. src/components/search-bar/filter-popover.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/search-bar/filter-popover.tsx
git commit -m "feat(filters): multi-select filter popover"
```

### Task 13: Search bar (search + species autocomplete + filters)

**Files:** Create `src/components/search-bar/search-bar.tsx`

- [ ] **Step 1: Implement** — debounced name search writing `q`, a species autocomplete dropdown (reusing `usePokemonList` + `displayName`), and the four `FilterPopover`s + clear-all. Debounce mirrors `card-search.tsx`.

```tsx
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFilterValues } from "../../hooks/use-filter-values";
import { usePokemonList } from "../../hooks/use-pokemon-list";
import { useNameQueryParam } from "../../hooks/use-url-selection";
import { displayName } from "../../utils/display-name";
import { FilterPopover } from "./filter-popover";

const MAX_SUGGESTIONS = 8;
const DEBOUNCE_MS = 300;

export function SearchBar() {
  const [query, setQuery] = useNameQueryParam();
  const [, setParams] = useSearchParams();
  const filterValues = useFilterValues();
  const list = usePokemonList();

  const [text, setText] = useState(query);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror external query changes (back button, cross-link) into the box.
  const lastCommitted = useRef(query);
  useEffect(() => {
    if (query !== lastCommitted.current) {
      setText(query);
      lastCommitted.current = query;
    }
  }, [query]);

  const commit = (next: string) => {
    const trimmed = next.trim();
    lastCommitted.current = trimmed;
    setQuery(trimmed);
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setText(next);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), DEBOUNCE_MS);
  };

  const suggestions =
    text.trim().length > 0
      ? list
          .filter((p) => p.name.startsWith(text.trim().toLowerCase()))
          .slice(0, MAX_SUGGESTIONS)
      : [];

  const pick = (name: string) => {
    const display = displayName(name);
    setText(display);
    setOpen(false);
    if (timer.current) clearTimeout(timer.current);
    commit(display);
  };

  const clearAll = () => {
    const next = new URLSearchParams();
    setParams(next);
    setText("");
    lastCommitted.current = "";
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={onInput}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (timer.current) clearTimeout(timer.current);
              commit(text);
              setOpen(false);
            } else if (e.key === "Escape") {
              setText("");
              commit("");
            }
          }}
          placeholder="Search cards by name (e.g. Pikachu, Charizard)"
          aria-label="Search cards by name"
          className="h-11 pl-10 pr-10"
        />
        {text && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setText("");
              commit("");
            }}
            className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </Button>
        )}
        {open && suggestions.length > 0 && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            {suggestions.map((p, i) => (
              <button
                key={p.name}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p.name)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <span>{displayName(p.name)}</span>
                <span className="text-xs text-muted-foreground">
                  #{String(i + 1).padStart(4, "0")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterPopover label="Type" paramName="types" options={filterValues.types} />
        <FilterPopover label="Rarity" paramName="rarity" options={filterValues.rarities} />
        <FilterPopover label="Supertype" paramName="supertype" options={filterValues.supertypes} />
        <FilterPopover label="Subtype" paramName="subtypes" options={filterValues.subtypes} />
        <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
          Clear all
        </Button>
      </div>
    </div>
  );
}
```

> Implementation note: the species `#NNNN` shown is the suggestion index, not the true national dex number — the autocomplete drives a name search, so the number is cosmetic. If you want the true dex number, derive it from the list index in `usePokemonList`. Keep it simple unless the verify step shows it matters.

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. src/components/search-bar/search-bar.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/search-bar/search-bar.tsx
git commit -m "feat(search): unified search bar with species autocomplete + filters"
```

### Task 14: Card grid — click opens the card route

**Files:** Modify `src/components/card-grid.tsx`

- [ ] **Step 1: Confirm the existing `onClick`** already does `navigate(\`/card/${card.id}\`)` (it does — see `card-grid.tsx:78-81`). No `state.background` is needed because `/card/:id` is a child of the `BrowsePage` layout (Task 16). **No change required** unless cross-link retarget is bundled here.

- [ ] **Step 2: Retarget Pokémon cross-links** — in `src/pages/sets-page.tsx` the overlay builds links to `/pokemon?q=…`; these move to `/?q=…`. This logic moves into `browse-page.tsx` in Task 15, so no edit here. Skip.

- [ ] **Step 3: No commit** (no change in this task; it exists to document that the grid is already correct).

### Task 15: `BrowsePage` — unified browse layout

**Files:** Create `src/pages/browse-page.tsx`

- [ ] **Step 1: Implement** — merges `sets-page` + `pokemon-page`. Resolves mode from the URL (`q` overrides `setId`), composes the cache key + fetcher exactly as the old pages did, defaults to the newest set, renders `SearchBar` + grid/timeline + a context header + the dialog `<Outlet/>`.

```tsx
import { useEffect, useMemo } from "react";
import { Outlet } from "react-router";
import { getCardsByName, getCardsBySet } from "../api";
import { CardGrid } from "../components/card-grid";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import type { HoloCardData } from "../components/holo-card";
import { PokemonTimeline } from "../components/pokemon-timeline";
import { SearchBar } from "../components/search-bar/search-bar";
import { ViewModeToggle } from "../components/view-mode-toggle";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { usePokemonList } from "../hooks/use-pokemon-list";
import { useSets } from "../hooks/use-sets";
import {
  useFilterParam,
  useNameQueryParam,
  useSetIdParam,
  useViewModeParam,
} from "../hooks/use-url-selection";
import { pickNewestSetId } from "../utils/pick-newest-set";
import { pokemonNameByDex } from "../utils/pokemon-name";

export function BrowsePage() {
  const sets = useSets();
  const pokemonList = usePokemonList();
  const [selectedSetId, setSelectedSetId] = useSetIdParam();
  const [query] = useNameQueryParam();
  const [view, setView] = useViewModeParam();
  const [types] = useFilterParam("types");
  const [rarity] = useFilterParam("rarity");
  const [supertype] = useFilterParam("supertype");
  const [subtypes] = useFilterParam("subtypes");

  const searching = query !== "";

  // Default to the newest set when nothing is selected and we're not searching.
  useEffect(() => {
    if (searching || sets.length === 0) return;
    const exists = selectedSetId && sets.some((s) => s.id === selectedSetId);
    if (!exists) {
      const newest = pickNewestSetId(sets);
      if (newest) setSelectedSetId(newest, { replace: true });
    }
  }, [searching, sets, selectedSetId, setSelectedSetId]);

  const filterSig = `${types.join(",")}|${rarity.join(",")}|${supertype.join(",")}|${subtypes.join(",")}`;
  const baseKey = searching
    ? `q:${encodeURIComponent(query)}`
    : selectedSetId
      ? selectedSetId
      : null;
  const cacheKey = baseKey
    ? filterSig === "|||"
      ? baseKey
      : `${baseKey}|${filterSig}`
    : null;

  const fetcher: CardFetcher = useMemo(
    () => (_key, page, pageSize) => {
      if (searching) {
        return getCardsByName(query, page, pageSize, { types, rarity, supertype, subtypes });
      }
      if (selectedSetId) {
        return getCardsBySet(selectedSetId, page, pageSize, { types, rarity, supertype, subtypes });
      }
      return Promise.resolve({ cards: [], totalCount: 0 });
    },
    [searching, query, selectedSetId, types, rarity, supertype, subtypes],
  );

  const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);

  function renderOverlay(card: HoloCardData) {
    if (searching) {
      return (
        <>
          <CrossLinkOverlay links={[{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` }]} />
          <CollectionToggle card={card} />
        </>
      );
    }
    const links = (card.nationalPokedexNumbers ?? []).flatMap((n) => {
      const name = pokemonNameByDex(pokemonList, n);
      return name ? [{ label: `View all ${name}`, to: `/?q=${encodeURIComponent(name)}` }] : [];
    });
    return (
      <>
        <CrossLinkOverlay links={links} />
        <CollectionToggle card={card} />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
      <SearchBar />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {searching ? `Results for "${query}"` : "Browse set"} · {cards.length} loaded
        </p>
        {searching && <ViewModeToggle value={view} onChange={setView} disabled={false} />}
      </div>
      {view === "timeline" && searching ? (
        <PokemonTimeline
          cards={cards}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={() => cacheKey && loadMore(cacheKey)}
          renderOverlay={renderOverlay}
        />
      ) : (
        <CardGrid setId={cacheKey} cards={cards} onEndReached={loadMore} renderOverlay={renderOverlay} />
      )}
      {loading && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-card px-4 py-2 text-sm shadow-lg">
          Loading…
        </div>
      )}
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. src/pages/browse-page.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/browse-page.tsx
git commit -m "feat(browse): unified browse page (set + search + filters + timeline)"
```

### Task 16: New route table

**Files:** Modify `src/main.tsx`

- [ ] **Step 1: Replace the router config** — pathless `BrowsePage` layout with dialog children; collection + holo-debug as siblings; `/pokemon` removed. (`CardDialog`/`PackDialog` are added in Phases 3–4; use the temporary placeholders noted below so this compiles now.)

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { BrowsePage } from "./pages/browse-page";
import { CardErrorPage } from "./pages/card-error-page";
import { cardLoader } from "./pages/card-loader";
import { CollectionPage } from "./pages/collection-page";
import { HoloDebugPage } from "./pages/holo-debug-page";
import { RootLayout } from "./root-layout";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <RootLayout />,
      children: [
        {
          element: <BrowsePage />,
          children: [
            { index: true, element: null },
            // card dialog — Phase 3 replaces element with <CardDialog/>
            {
              path: "card/:id",
              element: null,
              loader: cardLoader,
              errorElement: <CardErrorPage />,
            },
            // pack dialog — Phase 4 replaces element with <PackDialog/>
            { path: "pack/:setId", element: null },
          ],
        },
        { path: "collection", element: <CollectionPage /> },
        ...(import.meta.env.DEV ? [{ path: "holo-debug", element: <HoloDebugPage /> }] : []),
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
);

// biome-ignore lint/style/noNonNullAssertion: known to be there
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS. (Old `SetsPage`/`PokemonPage`/`PackPage`/`CardPage` are now unreferenced; they're deleted in later tasks. If `noUnusedLocals` complains, it only flags within-file — unreferenced files are fine.)

- [ ] **Step 3: Visual verification of Phase 2**

Run: `bun run build && bun run preview` then load the app in the browser preview (base `/pokemon-tcg-viewer/`).
Verify:
- Toolbar renders; newest set is auto-selected (its series auto-expands in the sidebar).
- Sidebar set symbols are uniformly small (bug fixed).
- Selecting a set loads its cards in the infinite grid; holo hover still works.
- Typing a name searches; clearing returns to the set.
- Filters narrow results; "Clear all" resets.
- Card click navigates to `/card/:id` (blank dialog area for now — expected until Phase 3).

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx
git commit -m "feat(routing): unified shell route table with dialog children"
```

---

## Phase 3 — Card dialog

### Task 17: `getTypeColor` / `getRarityColor` (TDD)

**Files:** Create `src/utils/card-colors.ts`, `src/utils/card-colors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { getRarityColor, getTypeColor } from "./card-colors";

describe("getTypeColor", () => {
  it("maps a known energy type", () => {
    expect(getTypeColor("Fire")).toBe("#F08030");
  });
  it("falls back for an unknown type", () => {
    expect(getTypeColor("Quantum")).toBe("#A8A878");
  });
});

describe("getRarityColor", () => {
  it("returns gold for secret/rainbow rarities", () => {
    expect(getRarityColor("Rare Secret")).toBe("#fbbf24");
  });
  it("returns neutral for empty rarity", () => {
    expect(getRarityColor("")).toBe("#9ca3af");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test src/utils/card-colors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (ported from `design-ref/lib/pokemon-api.ts`).

```ts
const TYPE_COLORS: Record<string, string> = {
  Colorless: "#A8A878",
  Darkness: "#705848",
  Dragon: "#7038F8",
  Fairy: "#EE99AC",
  Fighting: "#C03028",
  Fire: "#F08030",
  Grass: "#78C850",
  Lightning: "#F8D030",
  Metal: "#B8B8D0",
  Psychic: "#F85888",
  Water: "#6890F0",
};

/** Energy-type → swatch hex. Unknown types fall back to colorless. */
export function getTypeColor(type: string): string {
  return TYPE_COLORS[type] ?? "#A8A878";
}

/** Rarity → tier hex for badges. Empty/unknown → neutral grey. */
export function getRarityColor(rarity: string): string {
  if (!rarity) return "#9ca3af";
  const lower = rarity.toLowerCase();
  if (lower.includes("secret") || lower.includes("rainbow")) return "#fbbf24";
  if (lower.includes("ultra")) return "#a855f7";
  if (lower.includes("holo") || lower.includes("rare")) return "#3b82f6";
  if (lower.includes("uncommon")) return "#22c55e";
  return "#9ca3af";
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun test src/utils/card-colors.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/card-colors.ts src/utils/card-colors.test.ts
git commit -m "feat(card): borrowed type/rarity color helpers"
```

### Task 18: Move `buildPriceLines` out of card-page

**Files:** Create `src/components/card-dialog/price-lines.ts`

- [ ] **Step 1: Copy `buildPriceLines` + `PriceLine`** verbatim from `src/pages/card-page.tsx:29-69` into the new file, exporting both.

```ts
import type { FocusCardData } from "../../api";

export interface PriceLine {
  source: "TCGPlayer" | "Cardmarket";
  url: string;
  priceLabel: string;
  updatedAt: string;
}

export function buildPriceLines(card: FocusCardData): PriceLine[] {
  const lines: PriceLine[] = [];
  if (card.tcgplayer?.prices && card.tcgplayer.url) {
    const variantKeys = Object.keys(card.tcgplayer.prices);
    const firstVariant = variantKeys[0];
    const prices = firstVariant ? card.tcgplayer.prices[firstVariant] : undefined;
    const value = prices?.market ?? prices?.mid;
    if (value !== undefined) {
      lines.push({
        source: "TCGPlayer",
        url: card.tcgplayer.url,
        priceLabel: `$${value.toFixed(2)} market`,
        updatedAt: card.tcgplayer.updatedAt,
      });
    }
  }
  if (card.cardmarket?.prices && card.cardmarket.url) {
    const value =
      card.cardmarket.prices.averageSellPrice ??
      card.cardmarket.prices.trendPrice ??
      card.cardmarket.prices.avg30;
    if (value !== undefined) {
      lines.push({
        source: "Cardmarket",
        url: card.cardmarket.url,
        priceLabel: `€${value.toFixed(2)} avg`,
        updatedAt: card.cardmarket.updatedAt,
      });
    }
  }
  return lines;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. src/components/card-dialog/price-lines.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/card-dialog/price-lines.ts
git commit -m "refactor(card): extract buildPriceLines"
```

### Task 19: Card dialog component

**Files:** Create `src/components/card-dialog/card-dialog.tsx`

- [ ] **Step 1: Implement** — shadcn `Dialog`, open while mounted, close → `navigate(-1)` (falls back to `/`). 2-col: interactive `HoloCard size="focus"` + tilt toggle on the left; full detail on the right (types/HP, abilities, attacks, weakness/resistance/retreat, rules, flavor, artist, set, rarity, pricing, pokedex cross-links, collection toggle). Reuses the tilt-permission logic from `card-page.tsx`.

```tsx
import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import type { FocusCardData } from "../../api";
import { useStore } from "../../store";
import { usePokemonList } from "../../hooks/use-pokemon-list";
import { pokemonNameByDex } from "../../utils/pokemon-name";
import { getTypeColor } from "../../utils/card-colors";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CrossLinkOverlay } from "../cross-link-overlay";
import { HoloCard, type HoloCardData } from "../holo-card";
import { buildPriceLines } from "./price-lines";

function toHoloCardData(card: FocusCardData): HoloCardData {
  return {
    id: card.id,
    imageUrl: card.imageUrl,
    name: card.name,
    rarity: card.rarity,
    subtypes: card.subtypes,
    supertype: card.supertype,
    setId: card.setId,
    setName: card.setName,
    setSeries: card.setSeries,
    setReleaseDate: card.setReleaseDate,
    cardNumber: card.cardNumber,
    nationalPokedexNumbers: card.nationalPokedexNumbers,
  };
}

async function requestTiltPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const D = window.DeviceOrientationEvent as
    | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> })
    | undefined;
  if (!D) return false;
  if (typeof D.requestPermission === "function") {
    try {
      return (await D.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

export function CardDialog() {
  const card = useLoaderData() as FocusCardData;
  const navigate = useNavigate();
  const pokemonList = usePokemonList();
  const owned = useStore((s) => !!s.owned[card.id]);
  const add = useStore((s) => s.addToCollection);
  const remove = useStore((s) => s.removeFromCollection);
  const [tilt, setTilt] = useState(false);

  const isPokemon = card.supertype === "Pokémon";
  const priceLines = buildPriceLines(card);

  const crossLinks: { label: string; to: string }[] = [];
  for (const dex of card.nationalPokedexNumbers ?? []) {
    const name = pokemonNameByDex(pokemonList, dex);
    if (name) crossLinks.push({ label: `View all ${name}`, to: `/?q=${encodeURIComponent(name)}` });
  }
  crossLinks.push({ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` });

  const close = () => navigate(-1);

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogTitle className="sr-only">{card.name}</DialogTitle>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col items-center gap-3">
            <HoloCard
              imageUrl={card.imageUrl}
              name={card.name}
              rarity={card.rarity}
              subtypes={card.subtypes}
              supertype={card.supertype}
              setId={card.setId}
              cardNumber={card.cardNumber}
              size="focus"
              tilt={tilt}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (tilt) return setTilt(false);
                if (await requestTiltPermission()) setTilt(true);
              }}
            >
              {tilt ? "Tilt: on" : "Tilt to shine"}
            </Button>
          </div>

          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{card.name}</h2>
                <p className="text-muted-foreground">
                  {card.supertype}
                  {card.subtypes?.length ? ` · ${card.subtypes.join(", ")}` : ""}
                </p>
              </div>
              {card.hp && (
                <div className="text-right">
                  <span className="text-3xl font-bold text-primary">{card.hp}</span>
                  <span className="block text-xs text-muted-foreground">HP</span>
                </div>
              )}
            </div>

            {card.types?.length ? (
              <div className="flex flex-wrap gap-2">
                {card.types.map((t) => (
                  <span
                    key={t}
                    className="rounded-full px-3 py-1 text-sm font-medium text-white"
                    style={{ backgroundColor: getTypeColor(t) }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}

            {card.abilities?.length ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Abilities</h3>
                {card.abilities.map((a) => (
                  <div key={a.name} className="mb-2 rounded-lg bg-secondary p-3">
                    <div className="font-medium">{a.name} <span className="text-xs text-muted-foreground">{a.type}</span></div>
                    <p className="mt-1 text-sm text-muted-foreground">{a.text}</p>
                  </div>
                ))}
              </section>
            ) : null}

            {card.attacks?.length ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attacks</h3>
                {card.attacks.map((atk) => (
                  <div key={atk.name} className="mb-2 rounded-lg bg-secondary p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{atk.name}</span>
                      {atk.damage && <span className="font-bold text-primary">{atk.damage}</span>}
                    </div>
                    {atk.cost?.length ? <p className="mt-1 text-xs text-muted-foreground">Cost: {atk.cost.join(", ")}</p> : null}
                    {atk.text && <p className="mt-1 text-sm text-muted-foreground">{atk.text}</p>}
                  </div>
                ))}
              </section>
            ) : null}

            {isPokemon && (card.weaknesses?.length || card.resistances?.length || card.retreatCost?.length) ? (
              <section className="space-y-1 text-sm text-muted-foreground">
                {card.weaknesses?.length ? <p>Weakness: {card.weaknesses.map((w) => `${w.type} ${w.value}`).join(", ")}</p> : null}
                {card.resistances?.length ? <p>Resistance: {card.resistances.map((r) => `${r.type} ${r.value}`).join(", ")}</p> : null}
                {card.retreatCost?.length ? <p>Retreat: {card.retreatCost.length}</p> : null}
              </section>
            ) : null}

            {card.rules?.length ? (
              <section className="space-y-1">
                {card.rules.map((r) => <p key={r} className="text-sm text-muted-foreground">{r}</p>)}
              </section>
            ) : null}

            <div className="border-t border-border pt-3 text-sm">
              <p className="font-medium">{card.setName}</p>
              <p className="text-muted-foreground">{card.setSeries} · #{card.cardNumber}{card.rarity ? ` · ${card.rarity}` : ""}</p>
              {(card.flavorText || card.artist) && (
                <p className="mt-2 italic text-muted-foreground">
                  {card.flavorText}{card.artist ? ` — ${card.artist}` : ""}
                </p>
              )}
            </div>

            {priceLines.length ? (
              <section className="space-y-1 text-sm">
                {priceLines.map((l) => (
                  <p key={l.source}>
                    <strong>{l.source}</strong> · {l.priceLabel} ·{" "}
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">open ↗</a>
                  </p>
                ))}
              </section>
            ) : null}

            <div className="flex gap-3">
              <Button
                className="flex-1"
                variant={owned ? "default" : "outline"}
                onClick={() => (owned ? remove(card.id) : add(toHoloCardData(card)))}
              >
                {owned ? "✓ In collection — remove" : "+ Add to collection"}
              </Button>
            </div>

            <CrossLinkOverlay links={crossLinks} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. src/components/card-dialog/card-dialog.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/card-dialog/card-dialog.tsx
git commit -m "feat(card): rich card detail dialog"
```

### Task 20: Wire the card dialog into the route + delete card-page

**Files:** Modify `src/main.tsx`; Delete `src/pages/card-page.tsx`, `src/pages/card-page.css`

- [ ] **Step 1: Import + mount** — in `main.tsx`, `import { CardDialog } from "./components/card-dialog/card-dialog";` and replace the card child's `element: null` with `element: <CardDialog />` (keep `loader: cardLoader` + `errorElement`).

- [ ] **Step 2: Delete the old page**

```bash
git rm src/pages/card-page.tsx src/pages/card-page.css
```

- [ ] **Step 3: Check for stale references**

Run: `grep -rn "card-page" src || echo "clean"`
Expected: `clean` (the `card-page.test.tsx` will be handled next).

- [ ] **Step 4: Update/relocate the card-page test** — rename `src/pages/card-page.test.tsx` → `src/components/card-dialog/card-dialog.test.tsx` and update it to render `<CardDialog/>` inside a `createMemoryRouter` with a loader stub returning a `FocusCardData` fixture. Keep assertions that already pass (name, attacks, pricing). Run:

Run: `bun test src/components/card-dialog/card-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(card): mount card dialog route, remove card page"
```

---

## Phase 4 — Pack dialog

### Task 21: Pack dialog component

**Files:** Create `src/components/pack-dialog/pack-dialog.tsx`

- [ ] **Step 1: Implement** — shadcn `Dialog` opened for `:setId`, reusing `loadPackCards`, `BoosterPack`, and `rollPack`. Close → `navigate(-1)`.

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BoosterPack } from "../booster-pack";
import { CollectionToggle } from "../collection-toggle";
import { HoloCard, type HoloCardData } from "../holo-card";
import { useStore } from "../../store";
import { rollPack } from "../../utils/roll-pack";

const RIP_DURATION_MS = 320;

export function PackDialog() {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const sets = useStore((s) => s.sets);
  const pool = useStore((s) => (setId ? s.packCards[setId] : undefined));
  const loadPackCards = useStore((s) => s.loadPackCards);
  const ownedMap = useStore((s) => s.owned);
  const set = sets?.find((x) => x.id === setId);

  const [ripped, setRipped] = useState(false);
  const [pack, setPack] = useState<HoloCardData[] | null>(null);

  useEffect(() => {
    if (setId) loadPackCards(setId);
  }, [setId, loadPackCards]);

  const close = () => navigate(-1);
  const onRip = () => {
    if (!pool || pool.length === 0) return;
    setRipped(true);
    setTimeout(() => setPack(rollPack({ pool })), RIP_DURATION_MS);
  };
  const onReroll = () => {
    setRipped(false);
    setPack(null);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogTitle>{set ? `Open a ${set.name} pack` : "Open a pack"}</DialogTitle>
        {!set ? (
          <p className="text-sm text-muted-foreground">No set with id "{setId}".</p>
        ) : !pack ? (
          <div className="flex justify-center py-6">
            <BoosterPack set={set} ripped={ripped} onRip={onRip} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {pack.map((card) => (
                <HoloCard
                  key={card.id}
                  imageUrl={card.imageUrl}
                  imageUrlSmall={card.imageUrlSmall}
                  name={card.name}
                  rarity={card.rarity}
                  subtypes={card.subtypes}
                  supertype={card.supertype}
                  setId={card.setId}
                  cardNumber={card.cardNumber}
                  owned={!!ownedMap[card.id]}
                  hoverOverlay={<CollectionToggle card={card} />}
                  onClick={(e) => {
                    if (e.defaultPrevented) return;
                    navigate(`/card/${card.id}`);
                  }}
                  style={{ width: "100%" }}
                />
              ))}
            </div>
            <div className="flex justify-center pt-4">
              <Button onClick={onReroll}>Open another pack</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. src/components/pack-dialog/pack-dialog.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/pack-dialog/pack-dialog.tsx
git commit -m "feat(pack): pack opening dialog (reuses roll logic)"
```

### Task 22: Wire the pack dialog + delete pack-page

**Files:** Modify `src/main.tsx`; Delete `src/pages/pack-page.tsx`, `src/pages/pack-page.css`

- [ ] **Step 1: Mount** — in `main.tsx`, `import { PackDialog } from "./components/pack-dialog/pack-dialog";` and replace the pack child's `element: null` with `element: <PackDialog />`.

- [ ] **Step 2: Delete the old page**

```bash
git rm src/pages/pack-page.tsx src/pages/pack-page.css
```

- [ ] **Step 3: Relocate the pack-page test** — move `src/pages/pack-page.test.tsx` → `src/components/pack-dialog/pack-dialog.test.tsx`, rendering `<PackDialog/>` in a `createMemoryRouter` at `/pack/:setId` with a store pre-seeded pool. Keep assertions (rip → reveal). Run:

Run: `bun test src/components/pack-dialog/pack-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 4: Verify no stale refs + typecheck**

Run: `grep -rn "pack-page" src || echo "clean"` then `bun run typecheck`
Expected: `clean`, then PASS.

- [ ] **Step 5: Visual verification**

Run: `bun run build && bun run preview`.
Verify: toolbar "Open Packs" opens the selected set's pack dialog (no picker) → rip → 10 cards reveal with holo → "Open another pack" rerolls → revealed card click opens the card dialog → back button closes cleanly.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pack): mount pack dialog route, remove pack page"
```

---

## Phase 5 — Cleanup, re-skin, delete reference

### Task 23: Delete superseded components + merged pages

**Files:** Delete `src/pages/sets-page.tsx`, `src/pages/pokemon-page.tsx`, `src/components/header.tsx`, `src/components/header.css`, `src/components/series-menu/*`, `src/components/filter-chip-row/*`

- [ ] **Step 1: Remove the files**

```bash
git rm src/pages/sets-page.tsx src/pages/pokemon-page.tsx \
  src/components/header.tsx src/components/header.css \
  -r src/components/series-menu src/components/filter-chip-row
```

- [ ] **Step 2: Find and fix dangling imports**

Run: `grep -rn -E "sets-page|pokemon-page|components/header|series-menu|filter-chip-row" src || echo "clean"`
Expected: `clean`. Fix any hit (e.g. a leftover `import "./header.css"` in a test) before continuing.

- [ ] **Step 3: Move surviving tests** — `sets-page.test`/`pokemon-page.test` assertions that still apply move to a new `src/pages/browse-page.test.tsx` (render `BrowsePage` in a memory router, assert grid renders for a set and for a query). Delete obsolete assertions tied to removed layout. Run:

Run: `bun test src/pages/browse-page.test.tsx`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove superseded pages and components"
```

### Task 24: Re-skin the collection page

**Files:** Modify `src/pages/collection-page.tsx` (+ remove `collection-page.css` if fully migrated)

- [ ] **Step 1: Convert layout to Tailwind** — wrap content in `mx-auto max-w-7xl px-4 py-5`, header as `text-2xl font-bold`, empty state as `text-muted-foreground`, reuse the existing `CardGrid`. Keep all collection logic/hooks intact. Remove `import "./collection-page.css"` and the file once classes replace it.

- [ ] **Step 2: Verify the existing collection test still passes**

Run: `bun test src/pages/collection-page.test.tsx`
Expected: PASS (logic unchanged).

- [ ] **Step 3: Visual check** — `bun run preview`, open `/collection`, confirm owned cards render in the new theme.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(collection): re-skin with tailwind"
```

### Task 25: Migrate remaining component CSS → inline Tailwind

**Files:** `src/components/{card-search,pokemon-filter}.css` and their consumers; `src/components/card-grid.css`; `src/components/{view-mode-toggle,cross-link-overlay,collection-toggle,pokemon-timeline}` CSS as needed.

> `card-search.tsx` and `pokemon-filter.tsx` are superseded by `search-bar.tsx` — delete them and their CSS if nothing imports them (verify with grep). For components still in use (cross-link-overlay, collection-toggle, view-mode-toggle, pokemon-timeline, booster-pack), convert their `.css` to inline Tailwind class-by-class, keeping behavior identical. **Do NOT touch `holo-card/holo-card.css` or `holo-card/rarity-styles.css`.**

- [ ] **Step 1: Delete dead search components**

```bash
grep -rn -E "components/card-search|components/pokemon-filter" src || echo "clean"
```
If `clean`, `git rm src/components/card-search.tsx src/components/card-search.css src/components/card-search.test.tsx src/components/pokemon-filter.tsx src/components/pokemon-filter.css`.

- [ ] **Step 2: Convert each remaining in-use component's CSS** to inline classes, one component per commit. After each: `bun run typecheck` + `bun test <that component's test>` + visual check.

- [ ] **Step 3: Confirm no orphaned CSS imports**

Run: `grep -rn "import \"./" src/components --include=*.tsx | grep ".css" | grep -v holo-card || echo "only holo css remains"`
Expected: only holo-card CSS imports remain.

- [ ] **Step 4: Commit** (per component, e.g. `style(cross-link): inline tailwind`).

### Task 26: Full verification + delete `design-ref/`

**Files:** Delete `design-ref/`

- [ ] **Step 1: Full suite — lint, typecheck, tests in parallel**

Run (one batch):
```bash
bun run typecheck
bunx biome check --config-path=. src
bun test
```
Expected: all PASS. Fix any failures before continuing.

- [ ] **Step 2: Production build + preview smoke test**

Run: `bun run build && bun run preview`
Verify end-to-end: newest-set default · sidebar select · search + autocomplete · filters · infinite scroll · holo hover · card dialog (click + deep-link `/card/:id` + back) · pack dialog (Open Packs → rip → reveal → reroll) · collection · mobile sidebar sheet · offline indicator/install.

- [ ] **Step 3: Delete the reference (never committed)**

```bash
rm -rf design-ref
```

- [ ] **Step 4: Confirm working tree is clean of reference + has no `@radix-ui/react-*` strays**

Run: `git status --short && grep -rl "@radix-ui/react-" src || echo "unified"`
Expected: `design-ref/` gone from untracked; `unified`.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: finalize design revamp, remove reference"
```

---

## Self-Review

**Spec coverage**
- shadcn + Tailwind v4 + unified `radix-ui` → Tasks 1–6. ✓
- Unified shell (toolbar + sidebar + one grid) → Tasks 10–11, 15. ✓
- Sidebar series→sets, newest default, symbol-bug fix, mobile Sheet → Tasks 7–9, 10. ✓
- Search name-led + species autocomplete + filters (URL+API+Lucene mechanics) → Tasks 12–13, 15. ✓
- Card dialog (route-as-modal, rich content, holo+tilt, pricing, cross-links, deep-link) → Tasks 16–20. ✓
- Pack dialog (selected set only, our roll logic, no picker) → Tasks 21–22. ✓
- Collection stays a route → Task 16, 24. ✓
- Deep-purple theme tokens, inline Tailwind priority, holo CSS exempt → Tasks 4, 25. ✓
- Drop pagination / All-Cards / their pack logic / `/pokemon` / collection-context → Tasks 15, 16, 23 (and by omission). ✓
- API: keep ours, borrow color helpers → Task 17 (helpers in `utils/card-colors.ts`, a noted improvement over putting them in `api.ts`). ✓
- Delete `design-ref/`, never commit → Task 26. ✓
- Phase 2 search index → out of scope by design (documented in spec). ✓

**Placeholder scan:** No "TBD/TODO/handle later". Styling Tailwind classes are concrete starting points; visual-verify steps tune them. Tasks 20/22/23 reference relocating existing test files — assertions to keep are named, no blank "write tests" steps.

**Type consistency:** `pickNewestSetId(PokemonSet[]) → string|null`, `getTypeColor/getRarityColor(string) → string`, `buildPriceLines(FocusCardData) → PriceLine[]`, `HoloCardData`/`FocusCardData` per `api.ts`, `useFilterParam(name) → [string[], setter]`, `useCards(key, fetcher)` signature, `CardFetcher` — all match existing definitions and across tasks. Route children use `element` / `loader` / `errorElement` consistent with React Router 7.

**Known risk accepted:** if a future shadcn version splits the unified `radix-ui` import, Task 6 Step 2 catches it. Route-as-modal uses the pathless-layout pattern (no `state.background`), validated at Task 16 Step 3.

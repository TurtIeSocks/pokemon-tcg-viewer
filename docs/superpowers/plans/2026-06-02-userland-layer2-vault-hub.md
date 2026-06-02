# User-land Layer 2 — Vault Hub + IA — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Routing: follow existing `src/routes/` conventions (directory-nested + `index.tsx`); the build regenerates `src/routeTree.gen.ts` (gitignored) — never edit it by hand.

**Goal:** Rename `/collection` → a **Vault** hub: a layout route with a header (owned count + backup) and sub-nav (Cards · Sets · Goals); Cards is live (the existing owned grid), Sets/Goals are honest stubs for Layers 3/5.

**Design:** approved in roadmap Layer 2. Name = **Vault**; "Binder" reserved (future shareable showcases). Clean break — no `/collection` redirect (no users).

**Tech Stack:** TanStack Router/Start file routes, React 19, existing userland store/selectors, shadcn/ui, Bun test + RTL.

---

## Conventions
- Test: `bun test <path>`. Typecheck: `bunx tsc -b` (0). Lint: `bunx biome check --write <files>`. `git add` explicit paths.
- IDB auto in tests; inject repo (`setUserlandRepos(createIdbRepos())` + `resetUserlandForTests()`), foundation pattern.

## File structure
| File | Responsibility |
|---|---|
| `src/components/vault/owned-cards-grid.tsx` | Owned-cards grid (lifted from `collection.tsx`) |
| `src/components/vault/vault-backup-controls.tsx` | Export/Import buttons (lifted from `collection.tsx`) |
| `src/components/vault/vault-summary.ts(x)` | `useOwnedCardCount()` → distinct owned count |
| `src/routes/vault.tsx` | Layout: header (summary + backup) + sub-nav + `<Outlet/>` |
| `src/routes/vault/index.tsx` | Redirect → `/vault/cards` |
| `src/routes/vault/cards.tsx` | Renders `<OwnedCardsGrid>` |
| `src/routes/vault/sets.tsx` | Stub ("Set grid — coming soon", Layer 3) |
| `src/routes/vault/goals.tsx` | Stub ("Goals — coming soon", Layer 5) |
| `src/components/shell/app-toolbar.tsx` | Link `/collection`→`/vault`, label "Vault" |
| ~~`src/routes/collection.tsx`~~ | DELETED |

---

### Task 1: Extract presentational pieces from `collection.tsx`

**Files:** create `src/components/vault/{owned-cards-grid.tsx,vault-backup-controls.tsx,vault-summary.tsx}` + tests for the testable two.

- [ ] **Step 1: `vault-summary.tsx`** — a hook:

```tsx
import { useOwnedIndex } from "../../store/userland/selectors";
/** Count of distinct owned cards (≥1 copy). */
export function useOwnedCardCount(): number {
  return useOwnedIndex().size;
}
```

- [ ] **Step 2: `owned-cards-grid.tsx`** — lift `CollectionInner`'s grid (the `<ul>` of `HoloCardIsland` + `CollectionToggle`) into `OwnedCardsGrid()`. It calls `useEffect(() => { void loadCorpus(); void loadSets(); }, [loadSets])`, reads `useOwnedCardViews()`, and renders the grid or the empty state ("Your binder is empty. Add cards from any set."). Copy the existing JSX verbatim from `collection.tsx`.

- [ ] **Step 3: `vault-backup-controls.tsx`** — lift the export/import buttons + handlers (`onExport`→`exportUserData`+`downloadSnapshot`; `onImport`→`parseSnapshot`+`importUserData("replace")`; `fileRef`) into `VaultBackupControls()`. Same logic as `collection.tsx`.

- [ ] **Step 4: Tests**

```tsx
// vault-backup-controls.test.tsx — assert buttons render + import wiring (mock file)
// owned-cards-grid.test.tsx — seed an owned card via repo + addCopy, assert it renders; empty state when none.
```
(Use the foundation RTL+repo harness. For backup: assert "Export backup"/"Import backup" buttons exist; a happy-path import via a File with a valid snapshot updates the store — or keep it light: assert buttons present + `exportUserData` returns a snapshot.)

- [ ] **Step 5:** run tests → pass; `bunx tsc -b` 0; lint; commit (`feat(vault): extract owned grid + backup + summary from collection`).

---

### Task 2: Vault routes (layout + cards + stubs + index redirect)

**Files:** create `src/routes/vault.tsx`, `src/routes/vault/{index,cards,sets,goals}.tsx`; delete `src/routes/collection.tsx`.

- [ ] **Step 1: Layout `src/routes/vault.tsx`**

```tsx
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { VaultBackupControls } from "../components/vault/vault-backup-controls";
import { useOwnedCardCount } from "../components/vault/vault-summary";

export const Route = createFileRoute("/vault")({
  head: () => ({ meta: [{ title: "Your Vault — Pokémon TCG" }] }),
  component: VaultLayout,
});

function VaultHeader() {
  const count = useOwnedCardCount();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-bold">Your Vault</h1>
      <span className="text-sm text-muted-foreground">{count} cards</span>
      <div className="ml-auto"><VaultBackupControls /></div>
    </div>
  );
}

const tabCls = "rounded px-3 py-1.5 text-sm hover:bg-secondary";
function VaultLayout() {
  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-y-auto px-4 py-5">
      <ClientOnly fallback={<h1 className="mb-4 text-2xl font-bold">Your Vault</h1>}>
        <VaultHeader />
      </ClientOnly>
      <nav className="mb-4 flex gap-1 border-b border-border pb-2">
        <Link to="/vault/cards" className={tabCls} activeProps={{ className: `${tabCls} bg-secondary font-medium` }}>Cards</Link>
        <Link to="/vault/sets" className={tabCls} activeProps={{ className: `${tabCls} bg-secondary font-medium` }}>Sets</Link>
        <Link to="/vault/goals" className={tabCls} activeProps={{ className: `${tabCls} bg-secondary font-medium` }}>Goals</Link>
      </nav>
      <div className="min-h-0 flex-1"><Outlet /></div>
    </div>
  );
}
```

- [ ] **Step 2: `src/routes/vault/index.tsx`** (redirect)

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/vault/")({
  beforeLoad: () => { throw redirect({ to: "/vault/cards" }); },
});
```

- [ ] **Step 3: `src/routes/vault/cards.tsx`**

```tsx
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { OwnedCardsGrid } from "../../components/vault/owned-cards-grid";
export const Route = createFileRoute("/vault/cards")({ component: VaultCards });
function VaultCards() {
  return (
    <ClientOnly fallback={<p className="py-12 text-center text-muted-foreground">Loading your collection…</p>}>
      <OwnedCardsGrid />
    </ClientOnly>
  );
}
```

- [ ] **Step 4: stubs `vault/sets.tsx` + `vault/goals.tsx`**

```tsx
// sets.tsx
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/vault/sets")({ component: () => (
  <p className="py-12 text-center text-muted-foreground">Set grid — coming soon.</p>
)});
// goals.tsx — same shape, "Collection goals — coming soon.", path "/vault/goals"
```

- [ ] **Step 5: delete the old route** — `git rm src/routes/collection.tsx`.

- [ ] **Step 6: verify** — `bunx tsc -b` (0; the build/dev regenerates `routeTree.gen.ts` — if tsc complains the route tree is stale, run `bunx vite build` once to regenerate, or start the dev server). Lint. Commit (`feat(vault): vault hub layout + cards/sets/goals routes; drop /collection`).

> Note: `routeTree.gen.ts` regenerates from the route files via the plugin. If typecheck errors reference missing `/vault/*` routes, regenerate it (`bunx vite build` or boot `vite dev`) before trusting tsc.

---

### Task 3: Toolbar link

**Files:** `src/components/shell/app-toolbar.tsx`

- [ ] **Step 1:** change line ~65 `<Link to="/collection">Collection</Link>` → `<Link to="/vault">Vault</Link>`.
- [ ] **Step 2:** `bunx tsc -b` (0); lint; commit (`feat(vault): toolbar links to the Vault hub`).

---

### Task 4: Verify + smoke + review

- [ ] **Step 1:** `bunx tsc -b` & `bunx biome check src` & `bun test` (all green) & `bun run check:bundle`.
- [ ] **Step 2: Browser smoke** (`preview_start "vite"`): visit `/vault` → redirects to `/vault/cards`, shows owned grid + header count + backup buttons; sub-nav Cards/Sets/Goals switches; Sets/Goals show stubs; toolbar "Vault" link works; the owned card (Alakazam, from earlier) still shows. 0 console errors.
- [ ] **Step 3: Review** the diff (`caveman:cavecrew-reviewer`): confirm `/collection` fully gone, no dead imports, header/grid wiring correct, redirect works.

## Self-review checklist
- Rename complete (`/collection` deleted, toolbar updated, titles). ✓
- Cards live; Sets/Goals stubs for Layers 3/5. ✓
- Backup moved to header; owned count shown. ✓
- No store/repo changes.

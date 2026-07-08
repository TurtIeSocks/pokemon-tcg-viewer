# User-land Layer 3 — Set Grid — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Follow existing `src/routes/` patterns; the build regenerates `routeTree.gen.ts`.

**Goal:** `/vault/sets` (currently a stub) becomes a grid of **all sets grouped by series**, each tile showing an **owned-count overlay** ("13/120") + a completion progress bar.

**Design:** approved roadmap Layer 3. Reuse `SetTile`; add a client-computed owned-count overlay; server loader for the set list (SSR/crawlable), counts fill in client-side.

**Tech Stack:** TanStack Router/Start, React 19, existing userland store/corpus, Bun test + RTL.

---

## Conventions
- Test `bun test <path>`; typecheck `bunx tsc -b` (0); lint `bunx biome check --write <files>`. After route changes, regenerate `routeTree.gen.ts` via `bunx vite build`. `git add` explicit paths.

## File structure
| File | Change |
|---|---|
| `src/store/userland/selectors.ts` | add `tallyOwnedBySet` (pure) + `useOwnedCountBySet` hook + tests |
| `src/components/shell/set-tile.tsx` | optional `ownedCount?` → badge + progress bar (+ test) |
| `src/routes/vault/sets.tsx` | replace stub: loader `getNavTreeFn`, render grouped SetTiles w/ counts |

---

### Task 1: `useOwnedCountBySet` selector

**Files:** `src/store/userland/selectors.ts` (append) + `selectors.test.ts` (append)

- [ ] **Step 1: failing tests** (append)

```ts
import { tallyOwnedBySet } from "./selectors";

test("tallyOwnedBySet tallies distinct cardIds by their set via corpus byId", () => {
  const index = buildIndex([corpusCard("base1-1","base1"), corpusCard("base1-2","base1"), corpusCard("xy1-5","xy1")]);
  const counts = tallyOwnedBySet(["base1-1", "base1-2", "xy1-5"], index);
  expect(counts.get("base1")).toBe(2);
  expect(counts.get("xy1")).toBe(1);
});

test("tallyOwnedBySet skips cardIds absent from the corpus", () => {
  const index = buildIndex([corpusCard("base1-1","base1")]);
  const counts = tallyOwnedBySet(["base1-1", "ghost-9"], index);
  expect(counts.get("base1")).toBe(1);
  expect([...counts.keys()]).toEqual(["base1"]);
});
```
(`corpusCard(id, setId)` helper already exists in `selectors.test.ts` from Layer 0 — reuse it; it builds a `CorpusCard`. If its signature differs, adapt the call.)

- [ ] **Step 2: run → fail.** `bun test src/store/userland/selectors.test.ts`

- [ ] **Step 3: implement** (append to `selectors.ts`)

```ts
/** Tally distinct owned cardIds into per-set counts via the corpus byId map. */
export function tallyOwnedBySet(
  cardIds: Iterable<string>,
  index: CorpusIndex,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    const setId = index.byId.get(id)?.setId;
    if (!setId) continue;
    counts.set(setId, (counts.get(setId) ?? 0) + 1);
  }
  return counts;
}

/** Owned distinct-card count per setId. Empty until the corpus loads. */
export function useOwnedCountBySet(): Map<string, number> {
  useEnsureUserland();
  const items = useUserland((s) => s.items);
  const index = useCorpusRuntime((s) => s.index);
  return useMemo(() => {
    if (!index) return new Map<string, number>();
    const distinct = new Set(Object.values(items).map((i) => i.cardId));
    return tallyOwnedBySet(distinct, index);
  }, [items, index]);
}
```
(`CorpusIndex` is already imported in selectors.ts from Layer 0; if not, add `type CorpusIndex` to the corpus-engine import.)

- [ ] **Step 4: run → pass. Step 5: lint + commit** (`feat(vault): useOwnedCountBySet selector`).

---

### Task 2: `SetTile` owned-count overlay

**Files:** `src/components/shell/set-tile.tsx` + create `set-tile.test.tsx`

- [ ] **Step 1: failing test**

```tsx
// set-tile.test.tsx
import { expect, test } from "bun:test";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { SetTile } from "./set-tile";

const set = { id: "base1", name: "Base", slug: "base", logo: "l.png", symbol: "s.png", total: 102 };

async function renderInRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const router = createRouter({ routeTree: rootRoute });
  await router.load();
  return render(<RouterProvider router={router} />);
}

test("shows owned/total badge when ownedCount provided", async () => {
  await renderInRouter(<SetTile seriesSlug="base" set={set} ownedCount={13} />);
  expect(screen.getByText("13/102")).toBeDefined();
});

test("no badge when ownedCount omitted", async () => {
  await renderInRouter(<SetTile seriesSlug="base" set={set} />);
  expect(screen.queryByText(/\/102/)).toBeNull();
});
```

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement** — add the optional prop + overlay (keep the existing booster-pack markup; `.booster-pack` is already `position:relative` via its CSS, so absolute children anchor to it):

```tsx
export function SetTile({
  seriesSlug,
  set,
  ownedCount,
}: {
  seriesSlug: string;
  set: NavSet;
  ownedCount?: number;
}) {
  const showCount = ownedCount != null;
  const pct = showCount && set.total > 0 ? Math.min(100, Math.round((ownedCount / set.total) * 100)) : 0;
  return (
    <Link /* …existing props… */>
      {/* …existing foil/art/symbol… */}
      {showCount && (
        <>
          <span className="absolute right-2 top-2 z-10 rounded-md bg-black/65 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">
            {ownedCount}/{set.total}
          </span>
          <span className="absolute inset-x-0 bottom-0 z-10 h-1 bg-black/30">
            <span className="block h-full bg-(--accent,#e0b341)" style={{ width: `${pct}%` }} />
          </span>
        </>
      )}
    </Link>
  );
}
```

- [ ] **Step 4: run → pass. Step 5: lint + commit** (`feat(vault): SetTile owned-count overlay`).

---

### Task 3: `/vault/sets` route

**Files:** replace `src/routes/vault/sets.tsx`

- [ ] **Step 1: implement**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { SetTile } from "../../components/shell/set-tile";
import { loadCorpus } from "../../store/corpus/corpus-runtime";
import { getNavTreeFn } from "../../server/nav-tree";
import { useOwnedCountBySet } from "../../store/userland/selectors";

export const Route = createFileRoute("/vault/sets")({
  loader: () => getNavTreeFn(),
  component: VaultSets,
});

function VaultSets() {
  const tree = Route.useLoaderData();
  // biome-ignore lint/correctness/useExhaustiveDependencies: run-once on mount
  useEffect(() => { void loadCorpus(); }, []);
  const counts = useOwnedCountBySet();
  return (
    <div className="space-y-8">
      {tree.map((series) => (
        <section key={series.slug}>
          <h2 className="mb-3 text-lg font-semibold">{series.name}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {series.sets.map((set) => (
              <SetTile key={set.id} seriesSlug={series.slug} set={set} ownedCount={counts.get(set.id) ?? 0} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```
> Rendered directly (no `ClientOnly`): the set list is loader (server) data so tiles are SSR/crawlable; `useOwnedCountBySet` returns an empty map on the server + first client render (→ `0/total`), then counts fill in after `loadCorpus` — no hydration mismatch (both start at 0).

- [ ] **Step 2:** `bunx vite build` (regenerate route tree) → `bunx tsc -b` (0) → `bun test` (all pass). Lint. Commit (`feat(vault): set grid at /vault/sets with owned-count overlays`).

---

### Task 4: Verify + smoke + review

- [ ] `bunx tsc -b` & `bunx biome check src` & `bun test` & `bun run check:bundle` — all green.
- [ ] Browser smoke (`preview_start vite`): `/vault` → Sets tab → grid of sets grouped by series; the set containing the owned Alakazam (Base) shows `1/102` + a sliver progress bar; others `0/total`; tile click → set page. 0 console errors.
- [ ] Review diff (`caveman:cavecrew-reviewer`): selector correctness (distinct cardIds; corpus join), SetTile overlay, SSR/no-mismatch, no regressions to the series page (which omits `ownedCount`).

## Self-review
- Owned-count selector (distinct × corpus byId) — T1. SetTile overlay (opt-in, series page safe) — T2. Route grouped-by-series + counts + SSR — T3. ✓
- No store/repo changes.

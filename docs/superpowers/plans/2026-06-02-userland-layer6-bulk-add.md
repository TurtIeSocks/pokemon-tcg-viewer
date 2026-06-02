# User-land Layer 6 — Bulk Add — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** "Add all" from set / series / search pages → into the collection (skip-owned) and/or a goal (natural target).

**Design:** approved roadmap Layer 6. Skip-owned dedupe; goal add = set→set / series→series / search→capped card targets.

**Tech Stack:** React 19, shadcn `DropdownMenu`, existing userland store/corpus, Bun test + RTL.

---

## Conventions
- Test `bun test <path>`; typecheck `bunx tsc -b` (0); lint `bunx biome check --write <files>`. Pre-seed `useCorpusRuntime` in component tests (no network). `git add` explicit paths.

## File structure
| File | Change |
|---|---|
| `src/components/vault/bulk-add.ts` (new) | `cardIdsInSets` (pure) + `partitionUnowned` helpers |
| `src/components/vault/bulk-add-menu.tsx` (new) | the "Add all" dropdown |
| `src/routes/$series/$set/index.tsx` | add `BulkAddMenu` to the set header |
| `src/routes/$series/index.tsx` | add `BulkAddMenu` (series) — client island |
| `src/routes/search.tsx` | add `BulkAddMenu` (search results) |

---

### Task 1: pure helpers

**Files:** create `src/components/vault/bulk-add.ts` (+ `.test.ts`)

- [ ] **Step 1: failing tests**

```ts
import { expect, test } from "bun:test";
import { cardIdsInSets, partitionUnowned } from "./bulk-add";
import { buildIndex } from "../../store/corpus/corpus-engine";
import type { CorpusCard } from "../../store/corpus/corpus-types";

function cc(id: string, setId: string): CorpusCard { return { id, name:id, imageUrl:"", imageUrlSmall:"", supertype:"P", setId, number:"1" }; }
const index = buildIndex([cc("base1-1","base1"), cc("base1-2","base1"), cc("xy1-1","xy1")]);

test("cardIdsInSets returns corpus cardIds whose set is in the given setIds", () => {
  expect(cardIdsInSets(index, ["base1"]).sort()).toEqual(["base1-1","base1-2"]);
  expect(cardIdsInSets(index, ["base1","xy1"]).length).toBe(3);
  expect(cardIdsInSets(index, ["nope"])).toEqual([]);
});

test("partitionUnowned splits by an owned set", () => {
  const { toAdd, skipped } = partitionUnowned(["a","b","c"], new Set(["b"]));
  expect(toAdd).toEqual(["a","c"]);
  expect(skipped).toBe(1);
});
```

- [ ] **Step 2: run → fail. Step 3: implement**

```ts
import type { CorpusIndex } from "../../store/corpus/corpus-engine";

export function cardIdsInSets(index: CorpusIndex, setIds: string[]): string[] {
  const want = new Set(setIds);
  return index.cards.filter((c) => want.has(c.setId)).map((c) => c.id);
}

export function partitionUnowned(cardIds: string[], ownedCardIds: Set<string>): { toAdd: string[]; skipped: number } {
  const toAdd = cardIds.filter((id) => !ownedCardIds.has(id));
  return { toAdd, skipped: cardIds.length - toAdd.length };
}
```

- [ ] **Step 4: run → pass. lint + commit** (`feat(vault): bulk-add cardId helpers`).

---

### Task 2: `BulkAddMenu`

**Files:** create `src/components/vault/bulk-add-menu.tsx` (+ `.test.tsx`)

Contract: `BulkAddMenu({ cardIds: string[]; goalTarget?: GoalTarget; label?: string })`. A shadcn `DropdownMenu` (trigger = `Button` "Add all" / `label`). Items:
- **"Add N to collection"** (N = unowned count via `useOwnedIndex` + `partitionUnowned`): if N===0 disabled ("All owned"); else on click → if `N > 25` `window.confirm`; `await bulkAddCopies(toAdd)`; then `alert("Added "+N+(skipped? " · skipped "+skipped+" already owned":""))`.
- **"Add to goal"** submenu (shadcn `DropdownMenuSub`): list `useUserland(s=>s.goals)`; each → on click `await addGoalTargets(goal.id, [goalTarget ?? …cardIds as card targets, capped to 100])`. If no goals → a disabled "No goals yet" item. (Card-target mode only when `goalTarget` is undefined — the search page.)

- [ ] **Step 1: failing tests** (RTL + injected-repo harness)

```tsx
// bulk-add-menu.test.tsx — pseudo: render with cardIds=["base1-1","base1-2"], no goalTarget
// open menu, click "Add … to collection" → both added to the store (window.confirm stubbed true; window.alert stubbed)
// with a pre-created goal + goalTarget={kind:"set",setId:"base1"}, click the goal → goal gains the set target
```
Write concrete tests: stub `window.confirm`/`window.alert`; seed repo; assert `useUserland.getState().items` count after collection-add; assert the goal's `targets` after goal-add. (Open the dropdown via clicking the trigger; shadcn `DropdownMenu` renders items in a portal — query by role `menuitem`.)

- [ ] **Step 2–4:** implement (use shadcn `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuSub`/`DropdownMenuSubTrigger`/`DropdownMenuSubContent` from `../ui/dropdown-menu`); run → pass; lint; commit (`feat(vault): bulk-add menu`).

> If the portal/submenu is awkward to test in happy-dom, assert the two actions by calling the handlers through visible `menuitem`s; keep the test resilient (don't over-assert on submenu hover).

---

### Task 3: integrate the three pages

- [ ] **Set page** (`src/routes/$series/$set/index.tsx`): in the header row (next to "Open Packs"), add (inside the existing `ClientOnly`):
  `<BulkAddMenu cardIds={cards.map((c) => c.id)} goalTarget={{ kind: "set", setId: set.id }} />`

- [ ] **Series page** (`src/routes/$series/index.tsx`): this is a server-rendered list. Add a client island in the header: a small component that reads `useCorpusRuntime(s=>s.index)` + triggers `loadCorpus`, computes `cardIdsInSets(index, series.sets.map(s=>s.id))`, and renders `<BulkAddMenu cardIds={...} goalTarget={{ kind:"series", series: series.name }} />` (wrap in `ClientOnly`; null until corpus ready). Pass `series.name` + setIds via props.

- [ ] **Search page** (`src/routes/search.tsx`): add (in the header, when `q`) a client `BulkAddMenu` whose `cardIds` come from the corpus query — `queryCorpus(index, buildCorpusQuery(search, {}), setsById).map(c=>c.id)` (guard on corpus+sets ready; `[]` until then). No `goalTarget` (→ card targets). Reuse `buildCorpusQuery` (`../lib/card-query`) + `queryCorpus` (`../store/corpus/corpus-engine`).

- [ ] **Verify:** `bunx tsc -b` 0 + `bun test` all pass. Lint. Commit (`feat(vault): bulk-add on set/series/search pages`).

---

### Task 4: Verify + smoke + review

- [ ] `bunx tsc -b` & `bunx biome check src` & `bun test` & `bun run check:bundle` — green.
- [ ] Browser smoke (`preview_start vite`): on the Base set page → "Add all" → "Add … to collection" → confirm → owned count jumps (Alakazam skipped); "Add to goal" → pick "Charizard Master" → its detail gains the Base set target. Search "pikachu" → "Add all" works. 0 console errors.
- [ ] Review (`caveman:cavecrew-reviewer`): skip-owned correctness; large-N confirm; goal target kind per page; search cardIds match the grid; no crash when corpus not loaded.

## Self-review
- Helpers (T1), menu (T2), 3 integrations (T3). Skip-owned + confirm + goal-target. ✓
- Reuses bulkAddCopies/addGoalTargets/useOwnedIndex; corpus query reused for search.

# User-land Layer 5 — Collection Goals UI — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Forms: invoke **tanstack-form**. cmdk: use `src/components/ui/command.tsx`. The build regenerates `routeTree.gen.ts`.

**Goal:** Goals UI on the foundation's `GoalsRepo`/store actions: a `/vault/goals` list, a `/vault/goals/$goalId` detail page with per-target + overall progress, a name/description create-edit dialog, and a **cmdk** target picker (sets/series/cards).

**Design:** approved roadmap Layer 5 — **cmdk picker + full-route detail**.

**Tech Stack:** TanStack Router/Start, React 19, TanStack Form + Zod, cmdk, existing userland store/corpus, Bun test + RTL.

---

## Conventions
- Test `bun test <path>`; typecheck `bunx tsc -b` (0); lint `bunx biome check --write <files>`. After route changes run `bunx vite build` to regen `routeTree.gen.ts`. IDB-injected repo harness in tests; **pre-seed `useCorpusRuntime`** in any test that renders a component calling `loadCorpus` (no network). `git add` explicit paths.

## File structure
| File | Responsibility |
|---|---|
| `src/store/userland/goal-progress.ts` (new) | `computeGoalProgress` (pure) + types |
| `src/store/userland/selectors.ts` | `useGoalProgress(goal)` |
| `src/components/goals/goal-form-dialog.tsx` (new) | create/edit name+description (TanStack Form) |
| `src/components/goals/target-picker.tsx` (new) | cmdk dialog: search sets/series/cards → `addGoalTargets` |
| `src/components/goals/goal-target-row.tsx` (new) | one target: label + progress bar + remove |
| `src/components/goals/goal-detail.tsx` (new) | header/edit/delete + overall + target rows + add-target |
| `src/components/goals/goal-card.tsx` (new) | list item: name + overall bar + target count |
| `src/routes/vault/goals/index.tsx` (new) | goals list + New-goal |
| `src/routes/vault/goals/$goalId.tsx` (new) | detail page |
| ~~`src/routes/vault/goals.tsx`~~ | DELETED (stub → replaced by the dir) |

---

### Task 1: `computeGoalProgress` + `useGoalProgress`

**Files:** create `src/store/userland/goal-progress.ts` (+ `.test.ts`); append `useGoalProgress` to `selectors.ts`.

- [ ] **Step 1: failing tests** (`goal-progress.test.ts`)

```ts
import { expect, test } from "bun:test";
import { computeGoalProgress } from "./goal-progress";
import { buildIndex } from "../corpus/corpus-engine";
import type { CorpusCard } from "../corpus/corpus-types";
import type { PokemonSet } from "../../server/card-mappers";
import type { Goal } from "./types";

function cc(id: string, setId: string): CorpusCard { return { id, name: id, imageUrl: "", imageUrlSmall: "", supertype: "P", setId, number: "1" }; }
const index = buildIndex([cc("base1-1","base1"), cc("base1-2","base1"), cc("base2-1","base2"), cc("xy1-1","xy1")]);
const setsById = new Map<string, PokemonSet>([
  ["base1", { id:"base1", name:"Base", series:"Base", releaseDate:"1999", total:2, images:{symbol:"",logo:""} }],
  ["base2", { id:"base2", name:"Jungle", series:"Base", releaseDate:"1999", total:1, images:{symbol:"",logo:""} }],
  ["xy1", { id:"xy1", name:"XY", series:"XY", releaseDate:"2014", total:1, images:{symbol:"",logo:""} }],
]);
function goal(targets: Goal["targets"]): Goal { return { id:"g", name:"G", description:null, targets, createdAt:0, updatedAt:0 }; }

test("set/series/card target progress", () => {
  const owned = new Set(["base1-1", "base2-1"]);
  const p = computeGoalProgress(goal([
    { kind:"set", setId:"base1" },
    { kind:"series", series:"Base" },
    { kind:"card", cardId:"xy1-1" },
  ]), owned, index, setsById);
  expect(p.targets[0]).toMatchObject({ label:"Base", owned:1, total:2 });   // base1: own base1-1 of 2
  expect(p.targets[1]).toMatchObject({ label:"Base", owned:2, total:3 });   // series Base = base1(2)+base2(1)=3 total, own 2
  expect(p.targets[2]).toMatchObject({ label:"xy1-1", owned:0, total:1 });
});

test("overall dedups overlapping targets (set ⊂ series)", () => {
  const owned = new Set(["base1-1"]);
  // series Base covers base1-1,base1-2,base2-1 (3); set base1 ⊂ it → no double count
  const p = computeGoalProgress(goal([{ kind:"series", series:"Base" }, { kind:"set", setId:"base1" }]), owned, index, setsById);
  expect(p.overall).toEqual({ owned: 1, total: 3 });
});

test("overall adds an explicit card target outside covered sets", () => {
  const p = computeGoalProgress(goal([{ kind:"set", setId:"base1" }, { kind:"card", cardId:"xy1-1" }]), new Set(["xy1-1"]), index, setsById);
  expect(p.overall).toEqual({ owned: 1, total: 3 }); // base1(2) + xy1-1(1)
});
```

- [ ] **Step 2: run → fail. Step 3: implement** (`goal-progress.ts`)

```ts
import type { PokemonSet } from "../../server/card-mappers";
import type { CorpusIndex } from "../corpus/corpus-engine";
import type { Goal, GoalTarget } from "./types";

export interface TargetProgress { target: GoalTarget; label: string; owned: number; total: number; }
export interface GoalProgress { targets: TargetProgress[]; overall: { owned: number; total: number }; }

export function computeGoalProgress(
  goal: Goal, ownedCardIds: Set<string>, index: CorpusIndex, setsById: Map<string, PokemonSet>,
): GoalProgress {
  const seriesTotals = new Map<string, number>();
  const setIdsBySeries = new Map<string, Set<string>>();
  for (const s of setsById.values()) {
    seriesTotals.set(s.series, (seriesTotals.get(s.series) ?? 0) + s.total);
    let ids = setIdsBySeries.get(s.series);
    if (!ids) { ids = new Set(); setIdsBySeries.set(s.series, ids); }
    ids.add(s.id);
  }
  const ownedBySet = new Map<string, number>();
  for (const id of ownedCardIds) {
    const setId = index.byId.get(id)?.setId;
    if (setId) ownedBySet.set(setId, (ownedBySet.get(setId) ?? 0) + 1);
  }
  const ownedInSeries = (series: string): number => {
    let n = 0;
    for (const setId of setIdsBySeries.get(series) ?? []) n += ownedBySet.get(setId) ?? 0;
    return n;
  };
  const targets: TargetProgress[] = goal.targets.map((t) => {
    if (t.kind === "set") { const set = setsById.get(t.setId); return { target: t, label: set?.name ?? t.setId, owned: ownedBySet.get(t.setId) ?? 0, total: set?.total ?? 0 }; }
    if (t.kind === "series") return { target: t, label: t.series, owned: ownedInSeries(t.series), total: seriesTotals.get(t.series) ?? 0 };
    return { target: t, label: index.byId.get(t.cardId)?.name ?? t.cardId, owned: ownedCardIds.has(t.cardId) ? 1 : 0, total: 1 };
  });
  const coverSetIds = new Set<string>();
  const coverCardIds = new Set<string>();
  for (const t of goal.targets) {
    if (t.kind === "set") coverSetIds.add(t.setId);
    else if (t.kind === "series") for (const id of setIdsBySeries.get(t.series) ?? []) coverSetIds.add(id);
    else coverCardIds.add(t.cardId);
  }
  let total = 0, owned = 0;
  const counted = new Set<string>();
  for (const c of index.cards) {
    if (coverSetIds.has(c.setId) && !counted.has(c.id)) { counted.add(c.id); total++; if (ownedCardIds.has(c.id)) owned++; }
  }
  for (const id of coverCardIds) {
    if (!counted.has(id)) { counted.add(id); total++; if (ownedCardIds.has(id)) owned++; }
  }
  return { targets, overall: { owned, total } };
}
```

- [ ] **Step 4: `useGoalProgress`** (append to `selectors.ts`)

```ts
import { computeGoalProgress, type GoalProgress } from "./goal-progress";
import type { Goal } from "./types";

export function useGoalProgress(goal: Goal): GoalProgress | null {
  useEnsureUserland();
  const items = useUserland((s) => s.items);
  const index = useCorpusRuntime((s) => s.index);
  const sets = useStore((s) => s.sets);
  return useMemo(() => {
    if (!index || !sets) return null;
    const owned = new Set(Object.values(items).map((i) => i.cardId));
    return computeGoalProgress(goal, owned, index, new Map(sets.map((s) => [s.id, s])));
  }, [goal, items, index, sets]);
}
```

- [ ] **Step 5: run → pass. lint + commit** (`feat(goals): goal progress computation`).

---

### Task 2: `GoalFormDialog` + `TargetPicker`

**Files:** create `src/components/goals/goal-form-dialog.tsx`, `target-picker.tsx` (+ tests). **Invoke the `tanstack-form` skill** for the form dialog.

- [ ] **GoalFormDialog** `({ open, onOpenChange, goal?, onSaved? })`: shadcn `Dialog` + TanStack Form (Zod: `name` min 1; `description` optional). Create mode (no `goal`) → `await createGoal({name, description})` then `onSaved?.(created)`; edit mode → `updateGoal(goal.id, {...})`. Title/Description for a11y.

- [ ] **TargetPicker** `({ goalId, open, onOpenChange })`: a `CommandDialog` with `CommandInput` + grouped results:
  - `CommandGroup "Sets"` → `useStore(s=>s.sets)` items (value/keywords = set.name); select → `addGoalTargets(goalId, [{kind:"set", setId}])`.
  - `CommandGroup "Series"` → distinct `set.series` from sets; select → `{kind:"series", series}`.
  - `CommandGroup "Cards"` → corpus `useCorpusRuntime(s=>s.index)?.cards`; **cap to the top ~30 matches** (cmdk filters; guard the list size — don't render 20k items: render a slice and rely on cmdk's `shouldFilter`/value matching, or pre-filter by the input). Select → `{kind:"card", cardId}`.
  - On select: add the target + close (or keep open for multi-add — keep open, toast/close on a "Done"). Keep it simple: add + close.
- [ ] Tests: `goal-form-dialog.test.tsx` (create calls `createGoal` with name); `target-picker.test.tsx` (selecting a set calls `addGoalTargets` with `{kind:"set"}` — seed `useStore` sets + pre-seed corpus to avoid network).
- [ ] lint + commit (`feat(goals): goal form dialog + cmdk target picker`).

> **Cards list size:** never map all ~20k corpus cards into `CommandItem`s. Filter to items whose name includes the current input (min 1–2 chars) and slice to ~30; show a hint when empty/too-broad.

---

### Task 3: `GoalCard`, `GoalTargetRow`, `GoalDetail`

**Files:** create `src/components/goals/{goal-card,goal-target-row,goal-detail}.tsx` (+ a test for `goal-detail`).

- [ ] **GoalCard** `({ goal })`: a `Link` to `/vault/goals/$goalId` showing `goal.name`, target count, and an overall progress bar (via `useGoalProgress`).
- [ ] **GoalTargetRow** `({ goalId, tp: TargetProgress })`: icon by kind + `label` + `owned/total` + a progress bar + a remove button → `removeGoalTarget(goalId, tp.target)`.
- [ ] **GoalDetail** `({ goal })`: header (name, description, Edit → `GoalFormDialog` edit, Delete → confirm → `removeGoal` → navigate to `/vault/goals`); overall progress (`useGoalProgress`); list of `GoalTargetRow`; "Add target" → `TargetPicker`.
- [ ] Test (`goal-detail.test.tsx`): seed a goal + sets + corpus; renders name + a target row + overall; "Add target" opens the picker. (Pre-seed corpus/sets; no network.)
- [ ] lint + commit (`feat(goals): goal card, target row, detail`).

---

### Task 4: Routes (list + detail; replace stub)

**Files:** create `src/routes/vault/goals/index.tsx`, `src/routes/vault/goals/$goalId.tsx`; `git rm src/routes/vault/goals.tsx`.

- [ ] **`vault/goals/index.tsx`** (`/vault/goals`): `component` triggers `loadCorpus`/`loadSets`; reads `useUserland(s=>s.goals)`; renders a `New goal` button (opens `GoalFormDialog`, on save navigates to the new goal) + a grid of `GoalCard`; empty state ("No goals yet — create one to track a set, series, or specific cards.").
- [ ] **`vault/goals/$goalId.tsx`** (`/vault/goals/$goalId`): read `useParams`, find the goal in `useUserland(s=>s.goals)[goalId]`; if missing → a "Goal not found" + link back; else `<GoalDetail goal={goal} />`. Trigger `loadCorpus`/`loadSets`.
- [ ] Wrap client-only bits as needed (these read user data — render under the vault layout; use `ClientOnly` where the initial server render would differ, mirroring `vault/cards.tsx`).
- [ ] **Step: regen + verify** — `bunx vite build` (new `$goalId` route) → `bunx tsc -b` 0 → `bun test` all pass. Lint. Commit (`feat(goals): /vault/goals list + detail routes`).

---

### Task 5: Verify + smoke + review

- [ ] `bunx tsc -b` & `bunx biome check src` & `bun test` & `bun run check:bundle` — green.
- [ ] Browser smoke (`preview_start vite`): `/vault` → Goals → New goal "Charizard" → lands on detail; Add target → cmdk → add Base Set (and the Base series, and a card) → target rows show owned/total + overall; remove a target; the owned Alakazam contributes to Base counts; back to list shows the goal card with progress. 0 console errors.
- [ ] Review (`caveman:cavecrew-reviewer`): progress math (series totals, overall dedup), picker doesn't render 20k items, create→navigate, remove-target/delete-goal, no regressions.

## Self-review
- Progress (T1), dialogs/picker (T2), card/row/detail (T3), routes (T4). ✓
- Reuses foundation goal store actions; new code = progress selector + UI. cmdk cards list capped.

# User-land Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thin `owned` collection slice with a per-copy, repository-backed user-land data layer (collection + goals + import/export) that is storage-agnostic and ready to swap IndexedDB for a hosted DB later.

**Architecture:** A repository **port** (`CollectionRepo`/`GoalsRepo`/`BackupRepo` interfaces) with an IndexedDB adapter. A non-persisted Zustand store (`useUserland`) is a pure in-memory cache hydrated from the repo; free-function actions delegate to the repo then commit to the cache (mirrors the existing `corpus-runtime` pattern). Render data is never stored — it's joined from the in-memory corpus. `null` is the single dead value (keys always present), so IDB/JSON/SQL all agree.

**Tech Stack:** TypeScript (strict), Zustand v5, `idb-keyval`, TanStack Router, React 19, `bun test` + `fake-indexeddb` + happy-dom (globally preloaded via `bunfig.toml` → `src/test-setup.ts`), Biome.

**Spec:** [`docs/superpowers/specs/2026-06-02-userland-foundation-design.md`](../specs/2026-06-02-userland-foundation-design.md)
**Roadmap (OUT of scope here):** [`docs/superpowers/roadmap-userland.md`](../roadmap-userland.md)

---

## Conventions for every task

- **Single-file test run:** `bun test <path>` (e.g. `bun test src/store/userland/idb-repo.test.ts`).
- **Typecheck:** `bunx tsc -b`.
- **Lint (worktree caveat):** `bun run lint` can fail on a nested `biome.json` in a worktree. Use `bunx biome check --write <changed files>` per task instead. Full lint is run once at the end.
- `crypto.randomUUID()` is available in both Bun (tests) and browsers — used for IDs.
- IDB is available in tests automatically (the preload registers `fake-indexeddb/auto`). Repo tests do **not** import it.
- Conventional-commit messages; commit after each task.

## File structure (created / modified)

**New — `src/store/userland/`:**

| File | Responsibility |
|---|---|
| `types.ts` | `CollectionItem`, `CardGrading`, `Goal`, `GoalTarget`, `New*`/`*Patch`, `UserDataSnapshot` |
| `repo.ts` | Port interfaces: `CollectionRepo`, `GoalsRepo`, `BackupRepo`, `UserlandRepos` |
| `idb-repo.ts` | IDB adapters + `createIdbRepos()` + `getRepos()` |
| `backup.ts` | `isValidSnapshot`/`parseSnapshot` (pure) + `snapshotFilename`/`downloadSnapshot` (DOM) |
| `userland-store.ts` | `useUserland` cache + `loadUserland` + all actions + test DI helpers |
| `selectors.ts` | `useEnsureUserland`, `useOwnedIndex`, `useIsOwned`, `useOwnedCount`, `useOwnedCardViews` + pure `groupByCardId`/`joinOwnedViews` |
| `*.test.ts(x)` | Colocated tests |

**Modified:**

| File | Change |
|---|---|
| `src/store/corpus/corpus-engine.ts` | Add `byId` to `CorpusIndex`/`buildIndex`; export `hydrateCard` (was private `hydrate`) |
| `src/store/index.ts` | Persist only `{ sets, setsFetchedAt }`; drop `owned` + `CollectionSlice`; bump version to 9 |
| `src/store/index.test.ts` | Drop the `owned` assertion |
| `src/components/collection-toggle/collection-toggle.tsx` | Use `useIsOwned` + `addCopy`/`removeAllCopiesOfCard` |
| `src/components/collection-toggle/collection-toggle.test.tsx` | Rewrite for new async API |
| `src/components/card/card-detail.tsx` | `CollectionButton` → new API |
| `src/components/islands/pokemon-timeline.tsx` | `owned` map → `useOwnedIndex().has()` |
| `src/routes/collection.tsx` | Render `useOwnedCardViews()`; add minimal export/import controls |

**Deleted:** `src/store/collection-slice.ts`, `src/store/collection-slice.test.ts`.

**Deliberately untouched (deviation from spec, with reason):** `src/store/idb-storage.ts`'s legacy-localStorage migration is **kept**. It is harmless (only triggers when an old localStorage key exists, which it won't for new state) and removing it would churn `idb-storage.test.ts` for no functional gain. Removing it is optional cleanup, not foundation work.

---

### Task 1: User-land types

**Files:**
- Create: `src/store/userland/types.ts`

Types-only module (no runtime behavior) — verified by `tsc` and by every consuming task's tests.

- [ ] **Step 1: Create the types file**

```ts
// src/store/userland/types.ts

/** Raw (ungraded) condition, TCGplayer scale. */
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

export interface CardGrading {
  company: string; // "PSA" | "BGS" | "CGC" | "TAG" | "SGC" | … (UI offers a common set)
  grade: number;   // e.g. 9.5, 10
}

/** One physical copy a user owns. Dead value is null; every key is always present. */
export interface CollectionItem {
  id: string;          // copy uuid = future DB PK
  cardId: string;      // corpus card id (FK)
  acquiredAt: number;  // ms epoch; default = add time; editable
  createdAt: number;   // ms epoch; record creation; immutable
  pricePaid: number | null;       // null = unknown (≠ 0 = free)
  variant: string | null;         // printing key, seeded from corpus card.variants
  notes: string | null;
  condition: CardCondition | null; // raw state
  grading: CardGrading | null;     // null, or a COMPLETE { company, grade }
}

/** The user-editable fields of a copy. */
export type EditableCopyFields = Pick<
  CollectionItem,
  "acquiredAt" | "pricePaid" | "variant" | "notes" | "condition" | "grading"
>;

/** add() input: cardId + any editable fields; repo assigns id/createdAt, defaults acquiredAt, null-fills the rest. */
export type NewCollectionItem = { cardId: string } & Partial<EditableCopyFields>;

/** update() patch: field: null clears; omitted key leaves untouched. */
export type CopyPatch = Partial<EditableCopyFields>;

export type GoalTarget =
  | { kind: "set"; setId: string }
  | { kind: "series"; series: string }
  | { kind: "card"; cardId: string };

export interface Goal {
  id: string;
  name: string;
  description: string | null;
  targets: GoalTarget[];
  createdAt: number;
  updatedAt: number;
}

/** create() input. Repo assigns id/createdAt/updatedAt; fills description=null, targets=[]. */
export type NewGoal = { name: string; description?: string | null; targets?: GoalTarget[] };

export type GoalPatch = Partial<Pick<Goal, "name" | "description" | "targets">>;

/** Import/export envelope. */
export interface UserDataSnapshot {
  schemaVersion: 1;
  exportedAt: number;
  collection: CollectionItem[];
  goals: Goal[];
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc -b`
Expected: PASS (no errors).

- [ ] **Step 3: Lint + commit**

```bash
bunx biome check --write src/store/userland/types.ts
git add src/store/userland/types.ts
git commit -m "feat(userland): add per-copy collection + goal types"
```

---

### Task 2: Corpus engine — `byId` lookup + exported `hydrateCard`

**Files:**
- Modify: `src/store/corpus/corpus-engine.ts`
- Test: `src/store/corpus/corpus-engine.test.ts`

The join needs an id→card lookup (absent today) and must reuse the existing CorpusCard→HoloCardData logic (currently the private `hydrate`).

- [ ] **Step 1: Write failing tests**

Append to `src/store/corpus/corpus-engine.test.ts`:

```ts
import { buildIndex, hydrateCard } from "./corpus-engine";
import type { CorpusCard } from "./corpus-types";
import type { PokemonSet } from "../../server/card-mappers";

function corpusCard(id: string, over: Partial<CorpusCard> = {}): CorpusCard {
  return {
    id,
    name: over.name ?? "Test",
    imageUrl: `https://img.invalid/${id}.png`,
    imageUrlSmall: `https://img.invalid/${id}-sm.png`,
    supertype: over.supertype ?? "Pokémon",
    setId: over.setId ?? "base1",
    number: over.number ?? "1",
    ...over,
  };
}

const base1: PokemonSet = {
  id: "base1", name: "Base", series: "Base", releaseDate: "1999-01-09",
  total: 102, images: { symbol: "", logo: "" },
};

test("buildIndex exposes a byId lookup", () => {
  const index = buildIndex([corpusCard("base1-1"), corpusCard("base1-2")]);
  expect(index.byId.size).toBe(2);
  expect(index.byId.get("base1-2")?.id).toBe("base1-2");
  expect(index.byId.get("missing")).toBeUndefined();
});

test("hydrateCard joins set name/series from setsById", () => {
  const setsById = new Map([["base1", base1]]);
  const out = hydrateCard(corpusCard("base1-4", { setId: "base1", name: "Charizard" }), setsById);
  expect(out.name).toBe("Charizard");
  expect(out.setName).toBe("Base");
  expect(out.setSeries).toBe("Base");
});

test("hydrateCard falls back to setId when set is unknown", () => {
  const out = hydrateCard(corpusCard("x-1", { setId: "unknown" }), new Map());
  expect(out.setName).toBe("unknown");
  expect(out.setSeries).toBe("");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/corpus/corpus-engine.test.ts`
Expected: FAIL — `hydrateCard` is not exported; `index.byId` is undefined.

- [ ] **Step 3: Add `byId` to the interface and `buildIndex`**

In `src/store/corpus/corpus-engine.ts`, update the interface:

```ts
export interface CorpusIndex {
  cards: CorpusCard[];
  byId: Map<string, CorpusCard>;
  nameNorm: string[];
  nameTokens: string[][];
}
```

And `buildIndex`:

```ts
export function buildIndex(cards: CorpusCard[]): CorpusIndex {
  const nameNorm = cards.map((c) => normalize(c.name));
  const nameTokens = cards.map((c) =>
    c.name
      .split(/[\s-]+/)
      .map(normalize)
      .filter(Boolean),
  );
  const byId = new Map(cards.map((c) => [c.id, c]));
  return { cards, byId, nameNorm, nameTokens };
}
```

- [ ] **Step 4: Export `hydrateCard` (rename the private `hydrate`)**

Rename the existing `function hydrate(` to `export function hydrateCard(` and update its single internal call site (in `queryCorpus`, the final `return hits.map(...)`):

```ts
  return hits.map((h) => hydrateCard(h.card, setsById));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/store/corpus/corpus-engine.test.ts`
Expected: PASS (new + existing tests).

- [ ] **Step 6: Lint + commit**

```bash
bunx biome check --write src/store/corpus/corpus-engine.ts src/store/corpus/corpus-engine.test.ts
git add src/store/corpus/corpus-engine.ts src/store/corpus/corpus-engine.test.ts
git commit -m "feat(corpus): add byId lookup and export hydrateCard for the userland join"
```

---

### Task 3: Repository port interfaces

**Files:**
- Create: `src/store/userland/repo.ts`

Interfaces only — locks the contract every feature depends on.

- [ ] **Step 1: Create the interfaces**

```ts
// src/store/userland/repo.ts
import type {
  CollectionItem, CopyPatch, Goal, GoalPatch,
  NewCollectionItem, NewGoal, UserDataSnapshot,
} from "./types";

export interface CollectionRepo {
  list(): Promise<CollectionItem[]>;
  add(item: NewCollectionItem): Promise<CollectionItem>;
  bulkAdd(items: NewCollectionItem[]): Promise<CollectionItem[]>;
  update(id: string, patch: CopyPatch): Promise<void>; // null clears; absent leaves
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  clear(): Promise<void>;
}

export interface GoalsRepo {
  list(): Promise<Goal[]>;
  create(goal: NewGoal): Promise<Goal>;
  update(id: string, patch: GoalPatch): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface BackupRepo {
  exportAll(): Promise<UserDataSnapshot>;
  importAll(snapshot: UserDataSnapshot, mode: "replace" | "merge"): Promise<void>;
}

export interface UserlandRepos {
  collection: CollectionRepo;
  goals: GoalsRepo;
  backup: BackupRepo;
}
```

> Note: `GoalsRepo.clear()` is added (the spec's sketch omitted it) so `BackupRepo.importAll("replace")` can reset goals symmetrically.

- [ ] **Step 2: Typecheck + lint + commit**

```bash
bunx tsc -b
bunx biome check --write src/store/userland/repo.ts
git add src/store/userland/repo.ts
git commit -m "feat(userland): define repository port interfaces"
```

---

### Task 4: IDB adapter — CollectionRepo

**Files:**
- Create: `src/store/userland/idb-repo.ts`
- Test: `src/store/userland/idb-repo.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/store/userland/idb-repo.test.ts
import { beforeEach, expect, test } from "bun:test";
import { createIdbCollectionRepo } from "./idb-repo";

const repo = createIdbCollectionRepo();
beforeEach(async () => { await repo.clear(); });

test("add assigns id/createdAt/acquiredAt and null-fills omitted optionals", async () => {
  const item = await repo.add({ cardId: "base1-4" });
  expect(typeof item.id).toBe("string");
  expect(item.cardId).toBe("base1-4");
  expect(typeof item.createdAt).toBe("number");
  expect(typeof item.acquiredAt).toBe("number");
  expect(item.pricePaid).toBeNull();
  expect(item.variant).toBeNull();
  expect(item.notes).toBeNull();
  expect(item.condition).toBeNull();
  expect(item.grading).toBeNull();
});

test("add keeps provided fields and a caller-set acquiredAt", async () => {
  const item = await repo.add({ cardId: "x", acquiredAt: 111, pricePaid: 5, condition: "NM" });
  expect(item.acquiredAt).toBe(111);
  expect(item.pricePaid).toBe(5);
  expect(item.condition).toBe("NM");
});

test("list returns all added items", async () => {
  await repo.add({ cardId: "a" });
  await repo.add({ cardId: "b" });
  const all = await repo.list();
  expect(all.map((i) => i.cardId).sort()).toEqual(["a", "b"]);
});

test("update applies a patch; null clears, absent leaves untouched", async () => {
  const item = await repo.add({ cardId: "a", pricePaid: 9, notes: "mint" });
  await repo.update(item.id, { pricePaid: null }); // clear price, leave notes
  const [reloaded] = await repo.list();
  expect(reloaded.pricePaid).toBeNull();
  expect(reloaded.notes).toBe("mint");
});

test("update on a missing id is a no-op", async () => {
  await repo.update("nope", { pricePaid: 1 });
  expect(await repo.list()).toEqual([]);
});

test("remove and removeMany delete rows", async () => {
  const a = await repo.add({ cardId: "a" });
  const b = await repo.add({ cardId: "b" });
  const c = await repo.add({ cardId: "c" });
  await repo.remove(a.id);
  await repo.removeMany([b.id, c.id]);
  expect(await repo.list()).toEqual([]);
});

test("bulkAdd inserts many", async () => {
  const created = await repo.bulkAdd([{ cardId: "a" }, { cardId: "b" }]);
  expect(created).toHaveLength(2);
  expect((await repo.list())).toHaveLength(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: FAIL — `createIdbCollectionRepo` not found.

- [ ] **Step 3: Implement the CollectionRepo adapter**

```ts
// src/store/userland/idb-repo.ts
import {
  clear, createStore, del, delMany, entries, get, set, setMany,
  type UseStore,
} from "idb-keyval";
import type { CollectionItem, NewCollectionItem } from "./types";
import type { CollectionRepo } from "./repo";

const collectionStore = createStore("ptcg-collection", "items");
const goalsStore = createStore("ptcg-goals", "goals");

function fillItem(input: NewCollectionItem): CollectionItem {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    cardId: input.cardId,
    createdAt: now,
    acquiredAt: input.acquiredAt ?? now,
    pricePaid: input.pricePaid ?? null,
    variant: input.variant ?? null,
    notes: input.notes ?? null,
    condition: input.condition ?? null,
    grading: input.grading ?? null,
  };
}

export function createIdbCollectionRepo(store: UseStore = collectionStore): CollectionRepo {
  return {
    async list() {
      const rows = await entries<string, CollectionItem>(store);
      return rows.map(([, v]) => v);
    },
    async add(input) {
      const item = fillItem(input);
      await set(item.id, item, store);
      return item;
    },
    async bulkAdd(inputs) {
      const items = inputs.map(fillItem);
      await setMany(items.map((i) => [i.id, i] as [string, CollectionItem]), store);
      return items;
    },
    async update(id, patch) {
      const existing = await get<CollectionItem>(id, store);
      if (!existing) return;
      await set(id, { ...existing, ...patch }, store);
    },
    async remove(id) { await del(id, store); },
    async removeMany(ids) { await delMany(ids, store); },
    async clear() { await clear(store); },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts
git add src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts
git commit -m "feat(userland): IDB CollectionRepo adapter"
```

---

### Task 5: IDB adapter — GoalsRepo

**Files:**
- Modify: `src/store/userland/idb-repo.ts`
- Test: `src/store/userland/idb-repo.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `idb-repo.test.ts`:

```ts
import { createIdbGoalsRepo } from "./idb-repo";

const goals = createIdbGoalsRepo();
beforeEach(async () => { await goals.clear(); });

test("goals.create assigns id/timestamps and defaults description=null, targets=[]", async () => {
  const g = await goals.create({ name: "Gen 1 binder" });
  expect(typeof g.id).toBe("string");
  expect(g.name).toBe("Gen 1 binder");
  expect(g.description).toBeNull();
  expect(g.targets).toEqual([]);
  expect(g.createdAt).toBe(g.updatedAt);
});

test("goals.update patches fields and bumps updatedAt", async () => {
  const g = await goals.create({ name: "A" });
  await goals.update(g.id, { name: "B", targets: [{ kind: "set", setId: "base1" }] });
  const [reloaded] = await goals.list();
  expect(reloaded.name).toBe("B");
  expect(reloaded.targets).toEqual([{ kind: "set", setId: "base1" }]);
  expect(reloaded.updatedAt).toBeGreaterThanOrEqual(reloaded.createdAt);
});

test("goals.remove deletes", async () => {
  const g = await goals.create({ name: "A" });
  await goals.remove(g.id);
  expect(await goals.list()).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: FAIL — `createIdbGoalsRepo` not found.

- [ ] **Step 3: Implement the GoalsRepo adapter**

Add to `idb-repo.ts` (and extend the import to include nothing new — `get/set/del/clear/entries` already imported):

```ts
import type { Goal, NewGoal } from "./types";
import type { GoalsRepo } from "./repo";

function fillGoal(input: NewGoal): Goal {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description ?? null,
    targets: input.targets ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createIdbGoalsRepo(store: UseStore = goalsStore): GoalsRepo {
  return {
    async list() {
      const rows = await entries<string, Goal>(store);
      return rows.map(([, v]) => v);
    },
    async create(input) {
      const g = fillGoal(input);
      await set(g.id, g, store);
      return g;
    },
    async update(id, patch) {
      const existing = await get<Goal>(id, store);
      if (!existing) return;
      await set(id, { ...existing, ...patch, updatedAt: Date.now() }, store);
    },
    async remove(id) { await del(id, store); },
    async clear() { await clear(store); },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts
git add src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts
git commit -m "feat(userland): IDB GoalsRepo adapter"
```

---

### Task 6: IDB BackupRepo + `createIdbRepos`/`getRepos`

**Files:**
- Modify: `src/store/userland/idb-repo.ts`
- Test: `src/store/userland/idb-repo.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `idb-repo.test.ts`:

```ts
import { getRepos } from "./idb-repo";
import type { UserDataSnapshot } from "./types";

const repos = getRepos();
beforeEach(async () => { await repos.collection.clear(); await repos.goals.clear(); });

test("exportAll returns a v1 snapshot of current data", async () => {
  await repos.collection.add({ cardId: "a", pricePaid: 3 });
  await repos.goals.create({ name: "G" });
  const snap = await repos.backup.exportAll();
  expect(snap.schemaVersion).toBe(1);
  expect(snap.collection).toHaveLength(1);
  expect(snap.goals).toHaveLength(1);
  expect(typeof snap.exportedAt).toBe("number");
});

test("importAll replace clears then writes, preserving ids", async () => {
  await repos.collection.add({ cardId: "old" });
  const snap: UserDataSnapshot = {
    schemaVersion: 1, exportedAt: 0,
    collection: [{
      id: "fixed-1", cardId: "new", acquiredAt: 1, createdAt: 1,
      pricePaid: null, variant: null, notes: null, condition: null, grading: null,
    }],
    goals: [],
  };
  await repos.backup.importAll(snap, "replace");
  const all = await repos.collection.list();
  expect(all).toHaveLength(1);
  expect(all[0].id).toBe("fixed-1");
  expect(all[0].cardId).toBe("new");
});

test("importAll merge upserts by id without clearing", async () => {
  const existing = await repos.collection.add({ cardId: "keep" });
  const snap: UserDataSnapshot = {
    schemaVersion: 1, exportedAt: 0,
    collection: [{
      id: "added-1", cardId: "added", acquiredAt: 1, createdAt: 1,
      pricePaid: null, variant: null, notes: null, condition: null, grading: null,
    }],
    goals: [],
  };
  await repos.backup.importAll(snap, "merge");
  const ids = (await repos.collection.list()).map((i) => i.id).sort();
  expect(ids).toEqual(["added-1", existing.id].sort());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: FAIL — `getRepos` not found.

- [ ] **Step 3: Implement BackupRepo + factory**

Add to `idb-repo.ts`:

```ts
import type { BackupRepo, UserlandRepos } from "./repo";

function createIdbBackupRepo(collection: CollectionRepo, goals: GoalsRepo): BackupRepo {
  return {
    async exportAll() {
      const [c, g] = await Promise.all([collection.list(), goals.list()]);
      return { schemaVersion: 1, exportedAt: Date.now(), collection: c, goals: g };
    },
    async importAll(snapshot, mode) {
      if (mode === "replace") {
        await clear(collectionStore);
        await clear(goalsStore);
      }
      // Snapshot rows are full records — write verbatim to preserve ids.
      await setMany(
        snapshot.collection.map((i) => [i.id, i] as [string, CollectionItem]),
        collectionStore,
      );
      await setMany(
        snapshot.goals.map((g) => [g.id, g] as [string, Goal]),
        goalsStore,
      );
    },
  };
}

export function createIdbRepos(): UserlandRepos {
  const collection = createIdbCollectionRepo();
  const goals = createIdbGoalsRepo();
  const backup = createIdbBackupRepo(collection, goals);
  return { collection, goals, backup };
}

// The ONE swap point. Today: IDB. Later: choose by auth/config.
let repos: UserlandRepos | null = null;
export function getRepos(): UserlandRepos {
  return (repos ??= createIdbRepos());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts
git add src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts
git commit -m "feat(userland): IDB BackupRepo + repos factory/singleton"
```

---

### Task 7: Backup serialization — validate / parse / download

**Files:**
- Create: `src/store/userland/backup.ts`
- Test: `src/store/userland/backup.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/store/userland/backup.test.ts
import { expect, test } from "bun:test";
import { isValidSnapshot, parseSnapshot, snapshotFilename } from "./backup";
import type { UserDataSnapshot } from "./types";

const good: UserDataSnapshot = {
  schemaVersion: 1, exportedAt: 0,
  collection: [{
    id: "1", cardId: "a", acquiredAt: 1, createdAt: 1,
    pricePaid: null, variant: null, notes: null, condition: null, grading: null,
  }],
  goals: [{ id: "g1", name: "G", description: null, targets: [], createdAt: 1, updatedAt: 1 }],
};

test("isValidSnapshot accepts a v1 snapshot", () => {
  expect(isValidSnapshot(good)).toBe(true);
});

test("isValidSnapshot rejects wrong version / shape", () => {
  expect(isValidSnapshot({ ...good, schemaVersion: 2 })).toBe(false);
  expect(isValidSnapshot({ ...good, collection: "x" })).toBe(false);
  expect(isValidSnapshot({ ...good, collection: [{ id: 1, cardId: "a" }] })).toBe(false);
  expect(isValidSnapshot(null)).toBe(false);
  expect(isValidSnapshot({ schemaVersion: 1 })).toBe(false);
});

test("parseSnapshot returns the snapshot for valid JSON", () => {
  expect(parseSnapshot(JSON.stringify(good))).toEqual(good);
});

test("parseSnapshot throws on bad JSON and bad shape", () => {
  expect(() => parseSnapshot("{not json")).toThrow();
  expect(() => parseSnapshot(JSON.stringify({ schemaVersion: 9 }))).toThrow();
});

test("snapshotFilename formats the date", () => {
  expect(snapshotFilename(new Date("2026-06-02T10:00:00Z")))
    .toBe("pokemon-tcg-collection-2026-06-02.json");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/backup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement backup.ts**

```ts
// src/store/userland/backup.ts
import type { UserDataSnapshot } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isValidSnapshot(v: unknown): v is UserDataSnapshot {
  if (!isRecord(v)) return false;
  if (v.schemaVersion !== 1) return false;
  if (!Array.isArray(v.collection) || !Array.isArray(v.goals)) return false;
  const itemsOk = v.collection.every(
    (i) => isRecord(i) && typeof i.id === "string" && typeof i.cardId === "string",
  );
  const goalsOk = v.goals.every(
    (g) => isRecord(g) && typeof g.id === "string" && typeof g.name === "string",
  );
  return itemsOk && goalsOk;
}

export function parseSnapshot(json: string): UserDataSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!isValidSnapshot(data)) {
    throw new Error("Unrecognized or unsupported backup format.");
  }
  return data;
}

export function snapshotFilename(now: Date): string {
  return `pokemon-tcg-collection-${now.toISOString().slice(0, 10)}.json`;
}

/** Triggers a browser download of the snapshot. DOM-only; not unit-tested. */
export function downloadSnapshot(snapshot: UserDataSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = snapshotFilename(new Date());
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/store/userland/backup.ts src/store/userland/backup.test.ts
git add src/store/userland/backup.ts src/store/userland/backup.test.ts
git commit -m "feat(userland): backup validate/parse/download helpers"
```

---

### Task 8: User-land store — cache, hydration, DI helpers

**Files:**
- Create: `src/store/userland/userland-store.ts`
- Test: `src/store/userland/userland-store.test.ts`

A non-persisted Zustand cache + idempotent `loadUserland`. Actions are added in Tasks 9–11. Tests inject a fake repo via `setUserlandRepos`.

- [ ] **Step 1: Write failing tests**

```ts
// src/store/userland/userland-store.test.ts
import { beforeEach, expect, test } from "bun:test";
import {
  loadUserland, resetUserlandForTests, setUserlandRepos, useUserland,
} from "./userland-store";
import { createIdbRepos } from "./idb-repo";

beforeEach(async () => {
  const repos = createIdbRepos();
  await repos.collection.clear();
  await repos.goals.clear();
  setUserlandRepos(repos);
  resetUserlandForTests();
});

test("starts empty and not hydrated", () => {
  const s = useUserland.getState();
  expect(s.items).toEqual({});
  expect(s.goals).toEqual({});
  expect(s.hydrated).toBe(false);
});

test("loadUserland hydrates items and goals from the repo", async () => {
  const repos = createIdbRepos();
  const item = await repos.collection.add({ cardId: "a" });
  const goal = await repos.goals.create({ name: "G" });
  setUserlandRepos(repos);
  resetUserlandForTests();

  await loadUserland();
  const s = useUserland.getState();
  expect(s.hydrated).toBe(true);
  expect(s.items[item.id]?.cardId).toBe("a");
  expect(s.goals[goal.id]?.name).toBe("G");
});

test("loadUserland is idempotent once hydrated", async () => {
  await loadUserland();
  const first = useUserland.getState();
  await loadUserland();
  expect(useUserland.getState().items).toBe(first.items); // same ref, no refetch
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/userland-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store + hydration**

```ts
// src/store/userland/userland-store.ts
import { create } from "zustand";
import { getRepos } from "./idb-repo";
import type { UserlandRepos } from "./repo";
import type { CollectionItem, Goal } from "./types";

interface UserlandState {
  items: Record<string, CollectionItem>;
  goals: Record<string, Goal>;
  hydrated: boolean;
  loading: boolean;
}

const initial: UserlandState = { items: {}, goals: {}, hydrated: false, loading: false };

export const useUserland = create<UserlandState>(() => ({ ...initial }));

// --- Repo wiring (the swap point; overridable in tests) ---
let repos: UserlandRepos | null = null;
export function activeRepos(): UserlandRepos {
  return (repos ??= getRepos());
}
export function setUserlandRepos(r: UserlandRepos | null): void {
  repos = r;
}

// --- Hydration ---
async function fetchAll(r: UserlandRepos): Promise<Pick<UserlandState, "items" | "goals">> {
  const [itemList, goalList] = await Promise.all([r.collection.list(), r.goals.list()]);
  const items: Record<string, CollectionItem> = {};
  for (const it of itemList) items[it.id] = it;
  const goals: Record<string, Goal> = {};
  for (const g of goalList) goals[g.id] = g;
  return { items, goals };
}

let inFlight: Promise<void> | null = null;
export function loadUserland(): Promise<void> {
  if (useUserland.getState().hydrated) return Promise.resolve();
  if (inFlight) return inFlight;
  useUserland.setState({ loading: true });
  inFlight = (async () => {
    const { items, goals } = await fetchAll(activeRepos());
    useUserland.setState({ items, goals, hydrated: true, loading: false });
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Test helper: clear the in-flight guard and reset state. */
export function resetUserlandForTests(): void {
  inFlight = null;
  useUserland.setState({ ...initial });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/userland-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/store/userland/userland-store.ts src/store/userland/userland-store.test.ts
git add src/store/userland/userland-store.ts src/store/userland/userland-store.test.ts
git commit -m "feat(userland): non-persisted cache store + hydration"
```

---

### Task 9: Collection actions

**Files:**
- Modify: `src/store/userland/userland-store.ts`
- Test: `src/store/userland/userland-store.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `userland-store.test.ts`:

```ts
import {
  addCopy, bulkAddCopies, clearCollection, removeAllCopiesOfCard,
  removeCopy, updateCopy,
} from "./userland-store";

test("addCopy persists and commits to the cache", async () => {
  const item = await addCopy("base1-4", { pricePaid: 10 });
  expect(useUserland.getState().items[item.id]?.pricePaid).toBe(10);
  expect((await activeReposList())).toContain(item.id);
});

test("updateCopy patches cache and repo (null clears)", async () => {
  const item = await addCopy("a", { pricePaid: 5 });
  await updateCopy(item.id, { pricePaid: null });
  expect(useUserland.getState().items[item.id]?.pricePaid).toBeNull();
});

test("removeCopy removes one copy", async () => {
  const item = await addCopy("a");
  await removeCopy(item.id);
  expect(useUserland.getState().items[item.id]).toBeUndefined();
});

test("removeAllCopiesOfCard removes every copy of a card", async () => {
  await addCopy("dup");
  await addCopy("dup");
  await addCopy("other");
  await removeAllCopiesOfCard("dup");
  const remaining = Object.values(useUserland.getState().items);
  expect(remaining.every((i) => i.cardId === "other")).toBe(true);
  expect(remaining).toHaveLength(1);
});

test("bulkAddCopies adds many; clearCollection empties", async () => {
  await bulkAddCopies(["a", "b", "c"]);
  expect(Object.keys(useUserland.getState().items)).toHaveLength(3);
  await clearCollection();
  expect(useUserland.getState().items).toEqual({});
});

// helper used above
async function activeReposList(): Promise<string[]> {
  const { activeRepos } = await import("./userland-store");
  return (await activeRepos().collection.list()).map((i) => i.id);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/userland-store.test.ts`
Expected: FAIL — actions not exported.

- [ ] **Step 3: Implement the collection actions**

Append to `userland-store.ts` (add `EditableCopyFields`, `CopyPatch` to the type import):

```ts
import type { CopyPatch, EditableCopyFields } from "./types";

export async function addCopy(
  cardId: string,
  fields: Partial<EditableCopyFields> = {},
): Promise<CollectionItem> {
  const item = await activeRepos().collection.add({ cardId, ...fields });
  useUserland.setState((s) => ({ items: { ...s.items, [item.id]: item } }));
  return item;
}

export async function updateCopy(id: string, patch: CopyPatch): Promise<void> {
  await activeRepos().collection.update(id, patch);
  useUserland.setState((s) => {
    const existing = s.items[id];
    if (!existing) return s;
    return { items: { ...s.items, [id]: { ...existing, ...patch } } };
  });
}

export async function removeCopy(id: string): Promise<void> {
  await activeRepos().collection.remove(id);
  useUserland.setState((s) => {
    const items = { ...s.items };
    delete items[id];
    return { items };
  });
}

export async function removeAllCopiesOfCard(cardId: string): Promise<void> {
  const ids = Object.values(useUserland.getState().items)
    .filter((i) => i.cardId === cardId)
    .map((i) => i.id);
  if (ids.length === 0) return;
  await activeRepos().collection.removeMany(ids);
  useUserland.setState((s) => {
    const items = { ...s.items };
    for (const id of ids) delete items[id];
    return { items };
  });
}

export async function bulkAddCopies(
  cardIds: string[],
  fields: Partial<EditableCopyFields> = {},
): Promise<void> {
  const created = await activeRepos().collection.bulkAdd(
    cardIds.map((cardId) => ({ cardId, ...fields })),
  );
  useUserland.setState((s) => {
    const items = { ...s.items };
    for (const it of created) items[it.id] = it;
    return { items };
  });
}

export async function clearCollection(): Promise<void> {
  await activeRepos().collection.clear();
  useUserland.setState({ items: {} });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/userland-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/store/userland/userland-store.ts src/store/userland/userland-store.test.ts
git add src/store/userland/userland-store.ts src/store/userland/userland-store.test.ts
git commit -m "feat(userland): collection actions (add/update/remove/bulk/clear)"
```

---

### Task 10: Goal actions

**Files:**
- Modify: `src/store/userland/userland-store.ts`
- Test: `src/store/userland/userland-store.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `userland-store.test.ts`:

```ts
import {
  addGoalTargets, createGoal, removeGoal, removeGoalTarget, updateGoal,
} from "./userland-store";

test("createGoal commits to cache", async () => {
  const g = await createGoal({ name: "Gen 1" });
  expect(useUserland.getState().goals[g.id]?.name).toBe("Gen 1");
});

test("updateGoal patches name", async () => {
  const g = await createGoal({ name: "A" });
  await updateGoal(g.id, { name: "B" });
  expect(useUserland.getState().goals[g.id]?.name).toBe("B");
});

test("addGoalTargets de-duplicates; removeGoalTarget removes", async () => {
  const g = await createGoal({ name: "A" });
  await addGoalTargets(g.id, [{ kind: "set", setId: "base1" }]);
  await addGoalTargets(g.id, [{ kind: "set", setId: "base1" }]); // dup
  expect(useUserland.getState().goals[g.id]?.targets).toHaveLength(1);
  await removeGoalTarget(g.id, { kind: "set", setId: "base1" });
  expect(useUserland.getState().goals[g.id]?.targets).toHaveLength(0);
});

test("removeGoal deletes", async () => {
  const g = await createGoal({ name: "A" });
  await removeGoal(g.id);
  expect(useUserland.getState().goals[g.id]).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/userland-store.test.ts`
Expected: FAIL — goal actions not exported.

- [ ] **Step 3: Implement the goal actions**

Append to `userland-store.ts` (add `Goal`, `GoalPatch`, `GoalTarget`, `NewGoal` to imports as needed):

```ts
import type { GoalPatch, GoalTarget, NewGoal } from "./types";

function sameTarget(a: GoalTarget, b: GoalTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "set" && b.kind === "set") return a.setId === b.setId;
  if (a.kind === "series" && b.kind === "series") return a.series === b.series;
  if (a.kind === "card" && b.kind === "card") return a.cardId === b.cardId;
  return false;
}

function dedupeTargets(targets: GoalTarget[]): GoalTarget[] {
  const out: GoalTarget[] = [];
  for (const t of targets) if (!out.some((o) => sameTarget(o, t))) out.push(t);
  return out;
}

export async function createGoal(input: NewGoal): Promise<Goal> {
  const g = await activeRepos().goals.create(input);
  useUserland.setState((s) => ({ goals: { ...s.goals, [g.id]: g } }));
  return g;
}

export async function updateGoal(id: string, patch: GoalPatch): Promise<void> {
  await activeRepos().goals.update(id, patch);
  useUserland.setState((s) => {
    const existing = s.goals[id];
    if (!existing) return s;
    return { goals: { ...s.goals, [id]: { ...existing, ...patch, updatedAt: Date.now() } } };
  });
}

export async function removeGoal(id: string): Promise<void> {
  await activeRepos().goals.remove(id);
  useUserland.setState((s) => {
    const goals = { ...s.goals };
    delete goals[id];
    return { goals };
  });
}

export async function addGoalTargets(id: string, targets: GoalTarget[]): Promise<void> {
  const g = useUserland.getState().goals[id];
  if (!g) return;
  await updateGoal(id, { targets: dedupeTargets([...g.targets, ...targets]) });
}

export async function removeGoalTarget(id: string, target: GoalTarget): Promise<void> {
  const g = useUserland.getState().goals[id];
  if (!g) return;
  await updateGoal(id, { targets: g.targets.filter((t) => !sameTarget(t, target)) });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/userland-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/store/userland/userland-store.ts src/store/userland/userland-store.test.ts
git add src/store/userland/userland-store.ts src/store/userland/userland-store.test.ts
git commit -m "feat(userland): goal actions (create/update/remove/targets)"
```

---

### Task 11: Import / export actions

**Files:**
- Modify: `src/store/userland/userland-store.ts`
- Test: `src/store/userland/userland-store.test.ts`

Store actions stay DOM-free: `exportUserData` returns the snapshot (the component triggers the download); `importUserData` writes via the repo then force-refreshes the cache.

- [ ] **Step 1: Write failing tests**

Append to `userland-store.test.ts`:

```ts
import { exportUserData, importUserData } from "./userland-store";

test("export then import (replace) round-trips through the cache", async () => {
  await addCopy("a", { pricePaid: 7 });
  await createGoal({ name: "G" });
  const snap = await exportUserData();

  await clearCollection();
  await importUserData(snap, "replace");

  const items = Object.values(useUserland.getState().items);
  expect(items).toHaveLength(1);
  expect(items[0].pricePaid).toBe(7);
  expect(Object.values(useUserland.getState().goals)).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/userland-store.test.ts`
Expected: FAIL — actions not exported.

- [ ] **Step 3: Implement import/export actions**

Append to `userland-store.ts` (add `UserDataSnapshot` to imports):

```ts
import type { UserDataSnapshot } from "./types";

export function exportUserData(): Promise<UserDataSnapshot> {
  return activeRepos().backup.exportAll();
}

export async function importUserData(
  snapshot: UserDataSnapshot,
  mode: "replace" | "merge",
): Promise<void> {
  const r = activeRepos();
  await r.backup.importAll(snapshot, mode);
  const { items, goals } = await fetchAll(r); // force-refresh (loadUserland would no-op once hydrated)
  useUserland.setState({ items, goals, hydrated: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/userland-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/store/userland/userland-store.ts src/store/userland/userland-store.test.ts
git add src/store/userland/userland-store.ts src/store/userland/userland-store.test.ts
git commit -m "feat(userland): import/export store actions"
```

---

### Task 12: Selectors + corpus join

**Files:**
- Create: `src/store/userland/selectors.ts`
- Test: `src/store/userland/selectors.test.ts`

Pure helpers (`groupByCardId`, `joinOwnedViews`) are unit-tested directly; hooks wrap them.

- [ ] **Step 1: Write failing tests**

```ts
// src/store/userland/selectors.test.ts
import { expect, test } from "bun:test";
import { groupByCardId, joinOwnedViews } from "./selectors";
import { buildIndex } from "../corpus/corpus-engine";
import type { CorpusCard } from "../corpus/corpus-types";
import type { PokemonSet } from "../../server/card-mappers";
import type { CollectionItem } from "./types";

function item(id: string, cardId: string): CollectionItem {
  return {
    id, cardId, acquiredAt: 1, createdAt: 1,
    pricePaid: null, variant: null, notes: null, condition: null, grading: null,
  };
}
function corpusCard(id: string, setId = "base1"): CorpusCard {
  return { id, name: id, imageUrl: "", imageUrlSmall: "", supertype: "Pokémon", setId, number: "1" };
}
const base1: PokemonSet = {
  id: "base1", name: "Base", series: "Base", releaseDate: "1999-01-09",
  total: 102, images: { symbol: "", logo: "" },
};

test("groupByCardId groups copies by cardId", () => {
  const map = groupByCardId([item("1", "a"), item("2", "a"), item("3", "b")]);
  expect(map.get("a")).toHaveLength(2);
  expect(map.get("b")).toHaveLength(1);
});

test("joinOwnedViews returns one HoloCardData per distinct owned card", () => {
  const index = buildIndex([corpusCard("a"), corpusCard("b")]);
  const setsById = new Map([["base1", base1]]);
  const views = joinOwnedViews([item("1", "a"), item("2", "a"), item("3", "b")], index, setsById);
  expect(views.map((v) => v.id).sort()).toEqual(["a", "b"]);
  expect(views.find((v) => v.id === "a")?.setName).toBe("Base");
});

test("joinOwnedViews skips cards missing from the corpus", () => {
  const index = buildIndex([corpusCard("a")]);
  const views = joinOwnedViews([item("1", "a"), item("2", "ghost")], index, new Map([["base1", base1]]));
  expect(views.map((v) => v.id)).toEqual(["a"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/selectors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement selectors**

```ts
// src/store/userland/selectors.ts
import { useEffect, useMemo } from "react";
import type { HoloCardData } from "../../components/holo-card";
import type { PokemonSet } from "../../server/card-mappers";
import { type CorpusIndex, hydrateCard } from "../corpus/corpus-engine";
import { useCorpusRuntime } from "../corpus/corpus-runtime";
import { useStore } from "../index";
import type { CollectionItem } from "./types";
import { loadUserland, useUserland } from "./userland-store";

// --- Pure helpers (unit-tested) ---
export function groupByCardId(items: CollectionItem[]): Map<string, CollectionItem[]> {
  const map = new Map<string, CollectionItem[]>();
  for (const item of items) {
    const arr = map.get(item.cardId);
    if (arr) arr.push(item);
    else map.set(item.cardId, [item]);
  }
  return map;
}

export function joinOwnedViews(
  items: CollectionItem[],
  index: CorpusIndex,
  setsById: Map<string, PokemonSet>,
): HoloCardData[] {
  const seen = new Set<string>();
  const out: HoloCardData[] = [];
  for (const item of items) {
    if (seen.has(item.cardId)) continue;
    seen.add(item.cardId);
    const card = index.byId.get(item.cardId);
    if (card) out.push(hydrateCard(card, setsById));
  }
  return out;
}

// --- Hooks ---
/** Idempotently hydrate the userland cache. Safe to call from many components. */
export function useEnsureUserland(): void {
  useEffect(() => {
    void loadUserland();
  }, []);
}

export function useOwnedIndex(): Map<string, CollectionItem[]> {
  useEnsureUserland();
  const items = useUserland((s) => s.items);
  return useMemo(() => groupByCardId(Object.values(items)), [items]);
}

export function useIsOwned(cardId: string): boolean {
  return useOwnedIndex().has(cardId);
}

export function useOwnedCount(cardId: string): number {
  return useOwnedIndex().get(cardId)?.length ?? 0;
}

/** Distinct owned cards joined with the corpus. [] until corpus + sets load. */
export function useOwnedCardViews(): HoloCardData[] {
  useEnsureUserland();
  const items = useUserland((s) => s.items);
  const index = useCorpusRuntime((s) => s.index);
  const sets = useStore((s) => s.sets);
  return useMemo(() => {
    if (!index || !sets) return [];
    const setsById = new Map(sets.map((s) => [s.id, s]));
    return joinOwnedViews(Object.values(items), index, setsById);
  }, [items, index, sets]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/selectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/store/userland/selectors.ts src/store/userland/selectors.test.ts
git add src/store/userland/selectors.ts src/store/userland/selectors.test.ts
git commit -m "feat(userland): owned-index + corpus-join selectors"
```

---

### Task 13: Migrate call sites to the new store

**Files:**
- Modify: `src/components/collection-toggle/collection-toggle.tsx`
- Modify: `src/components/collection-toggle/collection-toggle.test.tsx`
- Modify: `src/components/card/card-detail.tsx`
- Modify: `src/components/islands/pokemon-timeline.tsx`
- Modify: `src/routes/collection.tsx`

The old `useStore.owned` API still exists at this point (removed in Task 14), so the app stays compilable throughout.

- [ ] **Step 1: Rewrite the CollectionToggle test for the async API**

Replace the body of `src/components/collection-toggle/collection-toggle.test.tsx`:

```tsx
import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
  resetUserlandForTests, setUserlandRepos,
} from "../../store/userland/userland-store";
import type { HoloCardData } from "../holo-card";
import { CollectionToggle } from "./collection-toggle";

const card: HoloCardData = {
  id: "base1-58", imageUrl: "https://example.invalid/p.png", name: "Pikachu",
  setId: "base1", setName: "Base", setSeries: "Base", cardNumber: "58",
};

let repos = createIdbRepos();
beforeEach(async () => {
  repos = createIdbRepos();
  await repos.collection.clear();
  await repos.goals.clear();
  setUserlandRepos(repos);
  resetUserlandForTests();
});

describe("<CollectionToggle />", () => {
  test("renders '+' when not owned", async () => {
    render(<CollectionToggle card={card} />);
    const btn = await screen.findByRole("button", { name: /add .* collection/i });
    expect(btn.textContent).toBe("+");
  });

  test("click adds a copy, then shows '✓'", async () => {
    render(<CollectionToggle card={card} />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(async () =>
      expect((await repos.collection.list()).some((i) => i.cardId === card.id)).toBe(true),
    );
    await screen.findByRole("button", { name: /remove .* collection/i });
  });

  test("click when owned removes all copies", async () => {
    await repos.collection.add({ cardId: card.id });
    resetUserlandForTests();
    render(<CollectionToggle card={card} />);
    fireEvent.click(await screen.findByRole("button", { name: /remove .* collection/i }));
    await waitFor(async () => expect(await repos.collection.list()).toHaveLength(0));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/collection-toggle/collection-toggle.test.tsx`
Expected: FAIL — toggle still uses the old `addToCollection` API.

- [ ] **Step 3: Rewrite CollectionToggle**

Replace `src/components/collection-toggle/collection-toggle.tsx` imports + hook usage + onClick (keep the class strings exactly as they are):

```tsx
import { useIsOwned } from "../../store/userland/selectors";
import { addCopy, removeAllCopiesOfCard } from "../../store/userland/userland-store";
import type { HoloCardData } from "../holo-card";

interface CollectionToggleProps {
  card: HoloCardData;
}

export function CollectionToggle({ card }: CollectionToggleProps) {
  const owned = useIsOwned(card.id);

  const label = owned
    ? `Remove ${card.name} from collection`
    : `Add ${card.name} to collection`;

  return (
    <button
      type="button"
      className={[
        "inline-flex items-center justify-center",
        "w-8 h-8 rounded-full",
        "text-base font-bold text-white",
        "border cursor-pointer",
        "transition-[background,transform] duration-[120ms] ease-out",
        "hover:scale-[1.08] focus-visible:scale-[1.08] focus-visible:outline-none",
        owned
          ? "bg-[rgba(80,200,120,0.92)] border-[rgba(80,200,120,1)] hover:bg-[rgba(60,180,100,1)] focus-visible:bg-[rgba(60,180,100,1)]"
          : "bg-[rgba(0,0,0,0.6)] border-[rgba(255,255,255,0.3)] hover:bg-[rgba(0,0,0,0.85)] focus-visible:bg-[rgba(0,0,0,0.85)]",
      ].join(" ")}
      aria-label={label}
      aria-pressed={owned}
      onClick={(e) => {
        e.preventDefault();
        if (owned) void removeAllCopiesOfCard(card.id);
        else void addCopy(card.id);
      }}
    >
      {owned ? "✓" : "+"}
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/collection-toggle/collection-toggle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Migrate `card-detail.tsx`**

In `src/components/card/card-detail.tsx`, replace the three `useStore` lines in `CollectionButton` (around lines 88-90) and the `onClick` (line 94). Remove the now-unused `useStore` import **only if** it has no other use in the file (check first — `card-detail` may use `useStore` elsewhere; if so, keep the import).

```tsx
// add near the other imports:
import { useIsOwned } from "../../store/userland/selectors";
import { addCopy, removeAllCopiesOfCard } from "../../store/userland/userland-store";

// inside CollectionButton:
  const owned = useIsOwned(card.id);
  return (
    <button
      type="button"
      onClick={() => (owned ? void removeAllCopiesOfCard(card.id) : void addCopy(card.id))}
      className={cn(
        "w-full rounded-[10px] py-2.5 text-center font-mono text-[13px] tracking-[0.04em] transition-colors",
        owned
          ? "bg-[color:var(--accent,#c9a86a)] font-bold text-[#1a1206]"
          : "border border-white/15 text-[#e7e3d8] hover:border-white/30",
      )}
    >
      {owned ? "✓ In collection" : "＋ Add to collection"}
    </button>
  );
```

- [ ] **Step 6: Migrate `pokemon-timeline.tsx`**

In `src/components/islands/pokemon-timeline.tsx`: remove `import { useStore } from "../../store";`, add `import { useOwnedIndex } from "../../store/userland/selectors";`. Replace line 19 and the `owned` prop (line 59):

```tsx
  const ownedIndex = useOwnedIndex();
  // …
                  owned={ownedIndex.has(card.id)}
```

- [ ] **Step 7: Migrate `collection.tsx` (render via join + minimal backup controls)**

Replace `src/routes/collection.tsx`:

```tsx
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { type ChangeEvent, useEffect, useRef } from "react";
import { CollectionToggle } from "../components/collection-toggle";
import { HoloCardIsland } from "../components/islands/holo-card-island";
import { useStore } from "../store";
import { loadCorpus } from "../store/corpus/corpus-runtime";
import { downloadSnapshot, parseSnapshot } from "../store/userland/backup";
import { useOwnedCardViews } from "../store/userland/selectors";
import { exportUserData, importUserData } from "../store/userland/userland-store";

export const Route = createFileRoute("/collection")({
  head: () => ({ meta: [{ title: "Your Collection — Pokémon TCG" }] }),
  component: CollectionPage,
});

function CollectionInner() {
  const loadSets = useStore((s) => s.loadSets);
  useEffect(() => {
    void loadCorpus();
    void loadSets();
  }, [loadSets]);

  const cards = useOwnedCardViews();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onExport() {
    downloadSnapshot(await exportUserData());
  }
  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importUserData(parseSnapshot(await file.text()), "replace");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={onExport} className="rounded border px-3 py-1.5 text-sm hover:bg-secondary">
          Export backup
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded border px-3 py-1.5 text-sm hover:bg-secondary">
          Import backup
        </button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImport} />
      </div>
      {cards.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          Your binder is empty. Add cards from any set.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {cards.map((card) => (
            <li key={card.id}>
              <HoloCardIsland
                imageUrl={card.imageUrl}
                imageUrlSmall={card.imageUrlSmall}
                name={card.name}
                rarity={card.rarity}
                subtypes={card.subtypes}
                supertype={card.supertype}
                setId={card.setId}
                series={card.setSeries}
                variants={card.variants}
                cardNumber={card.cardNumber}
                hoverOverlay={<CollectionToggle card={card} />}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CollectionPage() {
  return (
    <div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold">Your Collection</h1>
      <ClientOnly
        fallback={
          <p className="py-12 text-center text-muted-foreground">Loading your collection…</p>
        }
      >
        <CollectionInner />
      </ClientOnly>
    </div>
  );
}
```

- [ ] **Step 8: Typecheck + targeted tests**

Run: `bunx tsc -b && bun test src/components/collection-toggle/collection-toggle.test.tsx`
Expected: PASS (typecheck clean; toggle test green). `card-detail`, `pokemon-timeline`, `collection` have no dedicated tests but must typecheck.

- [ ] **Step 9: Lint + commit**

```bash
bunx biome check --write src/components/collection-toggle/collection-toggle.tsx src/components/collection-toggle/collection-toggle.test.tsx src/components/card/card-detail.tsx src/components/islands/pokemon-timeline.tsx src/routes/collection.tsx
git add src/components/collection-toggle src/components/card/card-detail.tsx src/components/islands/pokemon-timeline.tsx src/routes/collection.tsx
git commit -m "refactor: migrate collection UI to the userland store"
```

---

### Task 14: Remove the old collection slice + simplify persistence

**Files:**
- Delete: `src/store/collection-slice.ts`, `src/store/collection-slice.test.ts`
- Modify: `src/store/index.ts`
- Modify: `src/store/index.test.ts`

After Task 13 nothing references `owned`/`addToCollection`, so removal is safe.

- [ ] **Step 1: Update the store-index test first**

Replace `src/store/index.test.ts`:

```ts
import { expect, test } from "bun:test";
import { useStore } from "./index";

test("store exposes the sets slice", () => {
  const s = useStore.getState();
  expect(s.sets).toBeNull();
  expect(typeof s.loadSets).toBe("function");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/store/index.test.ts`
Expected: still PASS at the assertion level, but **typecheck** will fail next — proceed to gut the slice. (If you prefer a red bar first: this step's value is locking the target shape.)

- [ ] **Step 3: Delete the old slice + its test**

```bash
git rm src/store/collection-slice.ts src/store/collection-slice.test.ts
```

- [ ] **Step 4: Simplify `src/store/index.ts`**

Replace the whole file:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createIdbStorage } from "./idb-storage";
import { createSetsSlice, type SetsSlice } from "./sets-slice";

type AppStore = SetsSlice;

// The persisted subset returned by partialize — matches what IDB stores.
interface PersistedStore {
  sets: SetsSlice["sets"];
  setsFetchedAt: number | null;
}

// v9: collection moved out of the persist blob into the repo-backed userland
// store (src/store/userland). Only the sets cache is persisted here now.
const STORAGE_VERSION = 9;

export const useStore = create<AppStore>()(
  persist(createSetsSlice, {
    name: "pokemon-tcg-viewer",
    version: STORAGE_VERSION,
    storage: createIdbStorage<PersistedStore>(),
    partialize: (state) => ({
      sets: state.sets,
      setsFetchedAt: state.setsFetchedAt,
    }),
    // Older blobs may carry `owned` + cards-cache keys; we only keep the sets cache.
    migrate: (persisted) => {
      const p = (persisted ?? {}) as Partial<PersistedStore>;
      return { sets: p.sets ?? null, setsFetchedAt: p.setsFetchedAt ?? null } as PersistedStore;
    },
  }),
);
```

- [ ] **Step 5: Typecheck + run the affected tests**

Run: `bunx tsc -b && bun test src/store/index.test.ts`
Expected: PASS — no remaining references to `owned`/`CollectionSlice`.

- [ ] **Step 6: Lint + commit**

```bash
bunx biome check --write src/store/index.ts src/store/index.test.ts
git add src/store/index.ts src/store/index.test.ts src/store/collection-slice.ts src/store/collection-slice.test.ts
git commit -m "refactor(store): drop owned slice; persist only the sets cache (v9)"
```

---

### Task 15: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run lint, typecheck, and the full test suite in parallel**

Run (single batch, three commands):
```bash
bunx tsc -b
bunx biome check src
bun test
```
Expected: typecheck clean; Biome reports no errors on `src`; **all** tests pass (including pre-existing suites).

- [ ] **Step 2: If Biome flags worktree config noise**

If `bunx biome check src` errors on a nested `biome.json` (worktree quirk), run `bunx biome check --config-path=. src` instead. Fix any real findings; re-run.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Boot a throwaway dev server (`bunx vite dev`), open `/collection`:
- Add a card from any set → it appears; refresh → it persists (IDB).
- Export backup → a JSON file downloads.
- Clear/remove, then Import that file → cards return.

- [ ] **Step 4: Final commit (if Step 2 changed anything)**

```bash
git add -A
git commit -m "chore(userland): lint/typecheck pass for the foundation"
```

---

## Self-review checklist (run before handing off to execution)

**Spec coverage:**
- Per-copy model + null discipline → Task 1. ✓
- Corpus join (`byId` + `hydrateCard`) → Task 2. ✓
- Repository port → Task 3; IDB adapters → Tasks 4-6. ✓
- Import/export engine + minimal UI → Tasks 7, 11, 13. ✓
- Non-persisted cache + hydration → Task 8; actions → Tasks 9-11. ✓
- Selectors/owned index → Task 12. ✓
- Migrate 4 call sites → Task 13. ✓
- Clean break (drop owned + migrate dance) → Task 14. ✓
- Goal data model + GoalsRepo (no UI) → Tasks 1, 3, 5, 10. ✓
- Deferred (no task, by design): remote adapter, auth/sync, themed hub, grids, goals UI, bulk-add UX, owned filter, polished backup UX → roadmap.

**Type consistency:** `CollectionItem`/`CollectionRepo`/`UserlandRepos`/`CopyPatch`/`GoalPatch`/`UserDataSnapshot` names are used identically across Tasks 1, 3-12. `getRepos`/`createIdbRepos`/`activeRepos`/`setUserlandRepos`/`resetUserlandForTests` are defined once (Tasks 6, 8) and reused. `hydrateCard`/`byId` defined in Task 2, consumed in Task 12.

**Known intentional deviations from spec:** (1) `GoalsRepo.clear()` added for symmetric import-replace. (2) `idb-storage.ts` legacy-localStorage branch kept (harmless; avoids test churn). Both noted above.

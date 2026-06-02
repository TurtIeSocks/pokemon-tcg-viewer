# User-land Foundation — Design

**Date:** 2026-06-02
**Status:** Approved (design); plan pending
**Companion:** [`docs/superpowers/roadmap-userland.md`](../roadmap-userland.md) — the feature layers this foundation enables.

## Summary

Rebuild the local user-land data layer so it can carry a "serious collector" feature set (per-copy CRUD, set/card grids, collection goals, import/export) **and** swap from local storage to a hosted database later without rewriting feature code.

The mechanism is a **repository port**: UI and store depend on a `CollectionRepo` / `GoalsRepo` / `BackupRepo` interface, never on IndexedDB (or, later, a DB) directly. An IndexedDB adapter is built now; a remote adapter is a future drop-in.

This spec covers **only the foundation**: data model, storage, repo port + IDB adapter, the in-memory store + corpus join, the import/export engine, a minimal backup control, and migration of existing call sites. All user-facing feature surfaces (themed hub, grids, goals UI, bulk add, filters, polished import/export UX) are deferred to the roadmap.

## Context

Current state (to be replaced):

- `src/store/collection-slice.ts` — `owned: Record<cardId, { card: HoloCardData; count; addedAt }>`. Stores the **entire rendered card object** per owned card, inside the persisted Zustand blob.
- `src/store/index.ts` — Zustand `persist` blob (`idb-keyval` adapter) holding `{ sets, setsFetchedAt, owned }`, with a `migrate()` version dance (currently v8).
- The corpus (`src/store/corpus/`) already holds all ~20k cards in memory and is the natural source for render data.

Problems this causes for the target feature set:

1. **Binary ownership only.** One record per card, `count` is vestigial. No per-copy price/date/condition — exactly what the collector features need.
2. **Denormalized blob.** The whole `HoloCardData` is duplicated from the corpus into the persisted blob; every change re-serializes all state.
3. **No storage seam.** Persistence is hard-wired to the Zustand persist middleware. There is no interface to swap for a remote backend.

**No backwards compatibility is required** — the site has no users but the author. We do a clean break: drop the old `owned` data and the `migrate()` dance.

## Goals

- Per-copy ownership model with optional collector fields, stored normalized (IDs + user facts only).
- A storage-agnostic repository port; an IndexedDB adapter behind it.
- An in-memory reactive store (Zustand, non-persisted) that hydrates from the repo and is a pure cache.
- A corpus join so render data is never persisted.
- A versioned import/export engine (the user's data-safety requirement) plus a minimal backup control.
- Migrate the existing 4 call sites; keep the app working (collection page renders, toggle works).

## Non-goals (deferred to roadmap)

- Remote adapter, auth, sync, conflict resolution, optimistic updates.
- Themed hub / rename of "Collection", navigation/IA.
- Set grid, full card grid, multi-sort, per-copy CRUD UI / copy manager.
- Collection Goals UI (create/edit/target-picker/progress page).
- Bulk add UX, owned/not-owned set-page filter, polished import/export UX.

The **Goal data model + GoalsRepo** are built now (they define the port), but no Goals UI ships in the foundation.

## Data model

New module `src/store/userland/types.ts`:

```ts
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

export interface CardGrading {
  company: string; // "PSA" | "BGS" | "CGC" | "TAG" | "SGC" | … (free string; UI offers common set)
  grade: number;   // e.g. 9.5, 10
}

/** One physical copy a user owns. Maps 1:1 to a future DB row. */
export interface CollectionItem {
  id: string;          // copy uuid (crypto.randomUUID) = DB PK
  cardId: string;      // corpus card id (FK)
  acquiredAt: number;  // ms epoch; default = add time; editable
  createdAt: number;   // ms epoch; record creation; immutable (stable sort / sync)

  // Dead value is null (NEVER undefined); these keys are always present.
  // null = unknown (≠ 0 = free). Matches IDB/JSON/SQL; → SQL NULL.
  pricePaid: number | null;
  variant: string | null;    // printing key, seeded from corpus card.variants
  notes: string | null;

  // Card state: raw OR graded. null + null = unknown; UI toggles which is set.
  condition: CardCondition | null;            // raw
  grading: CardGrading | null;                // null, or a COMPLETE {company, grade};
                                              // a partial (company, no grade) is UI draft only
}

/** The user-editable fields of a copy. */
export type EditableCopyFields = Pick<CollectionItem,
  "acquiredAt" | "pricePaid" | "variant" | "notes" | "condition" | "grading">;

/** add() input: cardId + any editable fields. The repo assigns id/createdAt,
 *  defaults acquiredAt to now, and fills omitted optionals with null. */
export type NewCollectionItem = { cardId: string } & Partial<EditableCopyFields>;

/** update() patch: field: null CLEARS it; an omitted key LEAVES it untouched. */
export type CopyPatch = Partial<EditableCopyFields>;

export type GoalTarget =
  | { kind: "set"; setId: string }
  | { kind: "series"; series: string }
  | { kind: "card"; cardId: string };

export interface Goal {
  id: string;
  name: string;
  description: string | null;  // null = none (dead value is null, as above)
  targets: GoalTarget[];
  createdAt: number;
  updatedAt: number;
}

/** create() input. Repo assigns id/createdAt/updatedAt; fills description=null, targets=[]. */
export type NewGoal = { name: string; description?: string | null; targets?: GoalTarget[] };

/** Import/export envelope. */
export interface UserDataSnapshot {
  schemaVersion: 1;
  exportedAt: number;
  collection: CollectionItem[];
  goals: Goal[];
}
```

**Dead value is `null`, never `undefined`; every key is always present** (revised during brainstorm for DB-readiness). One sentinel enforced everywhere → no null/undefined battle when JSON export/import or a DB (both of which speak `null`) enters the mix; IDB structured-clone, JSON, and SQL all agree. `null` = unknown — still ≠ `0` (free) and ≠ magic strings, so the earlier no-sentinel decision stands; only the dead token changed from `undefined` to `null`.

This also disambiguates patches: in `update(id, patch)`, **`field: null` clears**, an **absent key leaves it untouched** — a distinction `undefined` cannot express. UI reset writes `null`. The only non-null default is `acquiredAt` (now). At the form boundary, React controlled inputs read `value={x ?? ""}`.

## Storage

Two IndexedDB databases via `idb-keyval`'s `createStore`, mirroring the existing corpus store (`createStore("ptcg-corpus","blob")`):

- `createStore("ptcg-collection", "items")` — key = copy `id` → `CollectionItem`.
- `createStore("ptcg-goals", "goals")` — key = goal `id` → `Goal`.

Per-row CRUD (`set`/`del`/`entries`/`clear`, `setMany`/`delMany` for bulk). Each write touches one row, scaling to a large collection and mapping directly to DB rows — unlike the persist blob, which re-serializes everything per change.

**Clean break:** the Zustand persist blob (`src/store/index.ts`) is simplified to persist **only** `{ sets, setsFetchedAt }`. The `owned` field and the `migrate()` version dance are removed. Old blobs' `owned` is simply ignored (no migration). The legacy-localStorage migration in `idb-storage.ts` is also removed (no users to migrate).

## Repository port

New module `src/store/userland/repo.ts` — interfaces only:

```ts
export interface CollectionRepo {
  list(): Promise<CollectionItem[]>;
  add(item: NewCollectionItem): Promise<CollectionItem>;
  bulkAdd(items: NewCollectionItem[]): Promise<CollectionItem[]>;
  update(id: string, patch: CopyPatch): Promise<void>; // field: null clears; absent key leaves it
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  clear(): Promise<void>;
}

export interface GoalsRepo {
  list(): Promise<Goal[]>;
  create(goal: NewGoal): Promise<Goal>;
  update(id: string, patch: Partial<Omit<Goal, "id" | "createdAt">>): Promise<void>;
  remove(id: string): Promise<void>;
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

**ID/timestamp/null-fill assignment lives in the adapter** (`add` assigns `id`, `createdAt`, `acquiredAt ?? now`, and fills any omitted editable field with `null`), so the contract is identical whether IDs come from `crypto.randomUUID()` (local) or a DB sequence (remote), and stored rows always have every key present.

New module `src/store/userland/idb-repo.ts` — IndexedDB adapter implementing all three, plus the factory:

```ts
export function createIdbRepos(): UserlandRepos { /* … */ }

// The ONE swap point. Today: IDB. Later: choose by auth/config.
let repos: UserlandRepos | null = null;
export function getRepos(): UserlandRepos {
  return (repos ??= createIdbRepos());
}
```

`BackupRepo.importAll` "replace" = `clear()` both stores then `bulkAdd`/`setMany`; "merge" = upsert by `id` (union). For testability the store accepts an injected `UserlandRepos` (defaults to `getRepos()`); tests pass a fake-indexeddb-backed or in-memory instance.

## In-memory store + corpus join

New module `src/store/userland/userland-store.ts` — a **non-persisted** Zustand store, mirroring `useCorpusRuntime` (persistence is the repo's job, not Zustand's):

```ts
interface UserlandState {
  items: Record<string, CollectionItem>; // by copy id
  goals: Record<string, Goal>;           // by goal id
  hydrated: boolean;
  loading: boolean;
}
export const useUserland = create<UserlandState>(() => ({ items: {}, goals: {}, hydrated: false, loading: false }));
```

Actions are plain async functions (not store methods, matching the corpus-runtime style) that `await repo.*` then commit to the store:

- `loadUserland()` — idempotent, in-flight-guarded (mirrors `loadCorpus`): `repo.collection.list()` + `repo.goals.list()` → set state, `hydrated = true`. Called from the same islands that read owned state and from the collection route.
- `addCopy(cardId, fields?)`, `updateCopy(id, patch)`, `removeCopy(id)`, `removeAllCopiesOfCard(cardId)`, `bulkAddCopies(cardIds[], fields?)`, `clearCollection()`.
- `createGoal/updateGoal/removeGoal/addGoalTargets/removeGoalTarget`.
- `exportUserData()` — `repo.backup.exportAll()` → `backup.ts` download helper.
- `importUserData(snapshot, mode)` — `repo.backup.importAll()` then **force-refresh** the cache (re-`list()` both stores and overwrite `items`/`goals`; `loadUserland`'s in-flight guard means a plain call would no-op, so import sets state directly from the post-import repo state).

**Corpus changes** (`src/store/corpus/corpus-engine.ts`): the join needs a by-id lookup, which doesn't exist today.

- Add `byId: Map<string, CorpusCard>` to `CorpusIndex`, populated in `buildIndex`.
- **Export** the currently-private `hydrate(card, setsById)` as `hydrateCard` so the join reuses the exact CorpusCard→HoloCardData logic (no duplication).

**Selectors / hooks** (`src/store/userland/selectors.ts`):

- `useOwnedIndex(): Map<cardId, CollectionItem[]>` — memoized on the `items` ref; the basis for ownership checks + counts.
- `useIsOwned(cardId): boolean` and `useOwnedCount(cardId): number`.
- `joinItem(item, index, setsById): { item: CollectionItem; card: HoloCardData }` and `useOwnedCardViews()` — distinct owned cards joined with the corpus for the collection grid. Returns `[]` until both corpus and sets are loaded (same null-guard pattern as `getSlugIndex`).

## Mutation flow

```
component → action (e.g. addCopy) → await repo.collection.add(item)
          → on resolve, commit row to useUserland.items
          → selectors re-join with corpus → components re-render
```

Await-then-commit (IDB ≈ instant). Optimistic update is a thin, remote-only later addition — not built now.

## Import / export

- **Export:** `exportUserData()` → `UserDataSnapshot` → `JSON.stringify` → `Blob` → anchor download, filename `pokemon-tcg-collection-YYYY-MM-DD.json`.
- **Import:** file input → `JSON.parse` → **validate** (`schemaVersion === 1`; `collection`/`goals` are arrays; each item has `id`+`cardId`; reject otherwise with a clear error) → `importUserData(snapshot, mode)`. A client-side validator in `src/store/userland/backup.ts` (structural guard; do not trust the file).
- **Minimal control now:** Export + Import buttons on the existing collection route so backup exists from day one. Placement/polish (settings page, merge-vs-replace prompt UX) is a roadmap item; the engine + a working button pair ship here.

## File layout

**New** (`src/store/userland/`):

```
types.ts            CollectionItem, CardGrading, Goal, GoalTarget, New*, UserDataSnapshot
repo.ts             CollectionRepo / GoalsRepo / BackupRepo / UserlandRepos interfaces
idb-repo.ts         IDB adapters + createIdbRepos() + getRepos()
idb-repo.test.ts
userland-store.ts   useUserland + loadUserland + all actions (DI: accepts repos)
userland-store.test.ts
selectors.ts        useOwnedIndex / useIsOwned / useOwnedCount / join helpers
selectors.test.ts
backup.ts           export download + import parse/validate
backup.test.ts
```

**Changed:**

- `src/store/corpus/corpus-engine.ts` — add `byId` to `CorpusIndex`/`buildIndex`; export `hydrateCard`.
- `src/store/index.ts` — persist only `{ sets, setsFetchedAt }`; drop `owned` + `migrate()`.
- `src/store/idb-storage.ts` — drop legacy-localStorage migration.
- `src/components/collection-toggle/collection-toggle.tsx` — use `useIsOwned` / `useOwnedCount`; not-owned → `addCopy(cardId)` with defaults; owned → `removeAllCopiesOfCard(cardId)` (faithful analog of today's binary remove; **interim** — the copy manager from roadmap layer "Per-copy CRUD" replaces it). Trigger `loadUserland()`.
- `src/components/card/card-detail.tsx` — same migration (was `add(card)` → `addCopy(card.id)`).
- `src/components/islands/pokemon-timeline.tsx` — replace `s.owned` read with `useOwnedIndex`/`useIsOwned`.
- `src/routes/collection.tsx` — read owned cards via `useOwnedCardViews()`; render the existing grid; add the minimal export/import buttons; trigger `loadUserland()`.

**Removed:** `src/store/collection-slice.ts` (+ `collection-slice.test.ts`).

## Testing strategy

`bun test`, colocated `*.test.ts`, `fake-indexeddb` (already a dep), happy-dom for hooks.

- **idb-repo.test.ts** — add assigns id/createdAt/acquiredAt + null-fills omitted optionals; update applies patch (`null` clears a field, absent key leaves it); remove/removeMany; bulkAdd; clear; goals CRUD; backup export shape; importAll replace vs merge.
- **userland-store.test.ts** — loadUserland hydrates + is idempotent/in-flight-guarded; each action writes repo and commits cache; import/export round-trip equals.
- **selectors.test.ts** — ownedByCardId grouping; isOwned/ownedCount; join produces correct HoloCardData via corpus (incl. cards present/absent in corpus).
- **corpus-engine** — `byId` populated; `hydrateCard` parity with prior `hydrate`.
- **backup.test.ts** — validator accepts v1, rejects bad version/shape; export→import→export is stable.

## Assumptions

- One IDB DB per concern (collection, goals) — matches the corpus store precedent; avoids `idb-keyval` multi-store-in-one-DB upgrade friction.
- `crypto.randomUUID()` for copy/goal IDs (available in the browser; tests run in happy-dom/Bun which provide it).
- Foundation keeps `/collection` as the route; the rename to a themed hub is roadmap layer 1.
- The interim destructive toggle behavior (owned → remove all copies) is acceptable because there is no production data yet; it is explicitly replaced by the copy-manager feature.
- `variant` values are seeded from `corpus card.variants` (TCGplayer price keys); free-form is allowed for printings the corpus lacks.
- `null` is the single dead value for collector fields; `undefined` is not used for them (keys are always present). idb-keyval uses structured clone, which preserves `null` losslessly, so stored ↔ exported ↔ (future) DB shapes match.
```

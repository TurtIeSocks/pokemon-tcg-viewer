# Multi-device Sync (Sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Library-touching tasks (supabase-js queries) verify current APIs via context7 before coding.

**Goal:** Make the signed-in Vault offline-first and multi-device — a per-user local cache + a background LWW sync engine reconciling cache ↔ cloud — without changing the signed-out local-first experience.

**Architecture:** `store → cache repo (per-uid IDB) ⇄ sync engine ⇄ SupabaseRepo (cloud)`. The hard logic is a **pure reconciler** `(cache, pulled, dirty) → (merged, toPush, watermark)`; the engine is a thin I/O shell (pull→reconcile→push, triggers, status). Server-clock LWW = last-push-wins; binders array-merge.

**Tech Stack:** TypeScript, Zustand, idb-keyval, supabase-js, Bun test (happy-dom + fake-indexeddb), local Supabase (cloud-vault stack on :55321).

**Reference:** spec `docs/superpowers/specs/2026-06-09-cloud-vault-sync-design.md`. Depends on A (merged): `SupabaseRepo`, `supabase-row` mappers, `getRepos`/`activeRepos` swap, `isCloudEnabled`, the `updated_at` trigger + `deleted_at` columns.

**Conventions (CLAUDE.md):** null-not-undefined; manual memo intentional; tests no-network (pre-seed corpus); typecheck `bunx tsc -b` (regen routeTree via brief `bun run dev` if it errors); lint `bunx biome check --write --config-path=. <files>`; per-spec test results trusted; full suite only at the end; commit per task; explicit `git add`; never commit `.env`/secrets.

---

## Shared contracts (define in Task 1; referenced everywhere)

```ts
// src/store/userland/sync/types.ts
type Entity = "stacks" | "binders" | "profiles";
interface DirtySet { stacks: Set<string>; binders: Set<string>; profiles: Set<string>; }
// Cloud rows arrive already mapped to domain (Stack/Binder/Profile) via A's supabase-row;
// a tombstone is a domain row whose deletedAt !== null.
interface ReconcileInput<T> { cache: Map<string, T>; pulled: T[]; dirtyIds: Set<string>; }
interface ReconcileOutput<T> { merged: Map<string, T>; toPush: T[]; }
// watermark (server time) is advanced by the engine from the pulled rows' max updatedAt.
```

## File structure

| File | Responsibility |
|---|---|
| `src/store/userland/sync/types.ts` | shared sync types (above) |
| `src/store/userland/sync/reconcile.ts` | **pure** reconciler: row-LWW (stacks/profiles) + binder array-merge + tombstones |
| `src/store/userland/sync/cache-repo.ts` | per-uid IDB cache `UserlandRepos` + dirty tracking + soft-delete |
| `src/store/userland/sync/sync-engine.ts` | pull→reconcile→push cycle, watermark, triggers, status emit |
| `src/store/userland/sync/sync-status.ts` | status store (offline/syncing/synced/error) + transition events |
| `src/store/userland/userland-store.ts` | (modify) signed-in `getRepos` → cache bundle; engine start/stop on auth; re-hydrate after pass |
| `src/components/sync/sync-indicator.tsx` | subtle status indicator |
| `src/components/sync/sync-toasts.ts` | deduped transition toasts |

---

## Phase 1 — Pure reconciler (the core)

### Task 1: Types + reconciler

**Files:** Create `src/store/userland/sync/types.ts`, `src/store/userland/sync/reconcile.ts`; Test `src/store/userland/sync/reconcile.test.ts`

- [ ] **Step 1 — failing tests** (table-driven, pure, no I/O). Cover, per entity:
  - pulled row, cache **not dirty** → cache accepts pulled (LWW: cloud newer than watermark).
  - pulled row, cache **dirty** (stack/profile) → keep local, row is in `toPush`.
  - pulled **tombstone** (deletedAt set), cache not dirty → merged row marked deleted (removed from live view); cache dirty → still local-wins (resurrect path documented).
  - **binder dirty + pulled binder** → `merged` = union(includeCardIds) ∪ pulled, union(excludeCardIds), rules merged by id; **exclude wins** (a card in both → excluded); result in `toPush`.
  - cache dirty, NOT in pulled → still in `toPush` (local change cloud hasn't seen).
  - empty pulled + empty dirty → no-op (`merged` == cache, `toPush` == []).
- [ ] **Step 2 — run FAIL.** `bun test src/store/userland/sync/reconcile.test.ts`
- [ ] **Step 3 — implement.** `types.ts` (contracts above). `reconcile.ts`: `reconcileStacks`/`reconcileProfiles` (row-LWW) + `reconcileBinders` (array-merge), or one `reconcile<T>(input, strategy)` with a `mergeStrategy` of `"row-lww" | "binder"`. Binder merge: a helper `mergeBinder(local, remote)` (union arrays, exclude-precedence, rules by id). Pure — no Date.now, no IDB, no network.
- [ ] **Step 4 — run PASS. Step 5 — commit** `feat(sync): pure reconciler (row-LWW + binder array-merge)`.

## Phase 2 — Per-user cache repo

### Task 2: Cache repo + dirty tracking

**Files:** Create `src/store/userland/sync/cache-repo.ts`; Test `src/store/userland/sync/cache-repo.test.ts`

- [ ] **Step 1 — failing tests** (fake-indexeddb): `createCacheRepos(uid)` returns a `UserlandRepos` bundle backed by `ptcg-cache-<uid>` stores. `add`/`update` mark the row dirty (recorded in a `dirty` meta set). `remove` = **soft-delete** (set `deletedAt`, mark dirty) — NOT a hard delete; `list()` filters `deletedAt != null`. A `dirtyIds(entity)` reader + `clearDirty(entity, ids)` (conditional: only clears ids whose row is unchanged since a passed snapshot version). Distinct uids use distinct stores (isolation).
- [ ] **Step 2 — FAIL → implement → PASS.** Mirror `idb-repo.ts` structure but per-uid stores + a dirty meta set + soft-delete. Reuse `uuidv7`, `fillStack`/`normalizeStack`-style fills.
- [ ] **Step 3 — commit** `feat(sync): per-user IDB cache repo with dirty tracking + soft-delete`.

## Phase 3 — Sync engine

### Task 3: Pull→reconcile→push cycle

**Files:** Create `src/store/userland/sync/sync-engine.ts`; Test `src/store/userland/sync/sync-engine.test.ts` (integration, local Supabase)

- [ ] **Step 1 — VERIFY DOCS.** supabase-js: select with `.gt('updated_at', watermark)` + pagination (`.range()`); upsert for push. Confirm row cap + range pagination.
- [ ] **Step 2 — failing integration test** (two cache instances `A`,`B` + one cloud, via the live stack + a signed-in test user, reuse A's `supabase-repo.test.ts` user-setup): `syncOnce(cacheRepos, remote, get/setWatermark)` — A writes a stack → `syncOnce(A)` pushes it; `syncOnce(B)` pulls it into B's cache. Conflict: A + B both edit the same stack offline → both `syncOnce` → last-push-wins. Binder: A adds card X, B adds card Y to same binder → after both sync, both present (union). Tombstone: A removes (soft) → B pulls → gone from B. Watermark advances; a second `syncOnce` with no changes is a no-op (no redundant re-pull of own pushes).
- [ ] **Step 3 — implement** `syncOnce`: paginated pull (`updated_at > watermark`) → map via `supabase-row` → `reconcile` per entity → write `merged` to cache → push `toPush` via `remote` upsert (incl. tombstones) → `clearDirty` (conditional) → advance watermark past pushed rows. Idempotent; per-row resilient (failed pushes stay dirty).
- [ ] **Step 4 — PASS + commit** `feat(sync): pull-reconcile-push cycle`.

### Task 4: Triggers + watermark persistence

**Files:** Modify `sync-engine.ts`; Test `sync-engine.test.ts`

- [ ] **Step 1 — failing tests** (mock online/offline + focus events; fake timers): `startSync(...)` registers `online`/reconnect, `visibilitychange`/focus, and a debounced post-write trigger (~1.5s); fires `syncOnce` on each; `stopSync()` removes listeners. Watermark persisted per-uid (`ptcg-cache-<uid>` meta key `lastSyncedAt`). Offline (fetch failure / `!navigator.onLine`) → no push attempt; queued (dirty) flushes on reconnect.
- [ ] **Step 2 — FAIL → implement → PASS. Step 3 — commit** `feat(sync): triggers + persisted watermark`.

### Task 5: Status store + transitions

**Files:** Create `src/store/userland/sync/sync-status.ts`; Test `sync-status.test.ts`

- [ ] **Step 1 — failing tests:** a small store exposing `status: "offline"|"syncing"|"synced"|"error"`; `syncOnce` drives it (syncing on start, synced/error on finish, offline when no connection). Exposes a **transition event stream** (prev→next) so toasts can dedup: emits `went-offline`, `reconnected-synced` (only if previously offline), `persistent-error` (after N consecutive failures), `first-sync-complete` (once per uid). No event on routine `syncing→synced`.
- [ ] **Step 2 — FAIL → implement → PASS. Step 3 — commit** `feat(sync): status store + transition events`.

## Phase 4 — Store wiring + soft-delete flip

### Task 6: Wire cache bundle + engine into the store

**Files:** Modify `src/store/userland/userland-store.ts`; Test `userland-store.test.ts`

- [ ] **Step 1 — failing tests** (preserve the existing seam — all current `userland-store.test.ts` stay green): signed-in (`isCloudEnabled()` + session) → `activeRepos()` returns the **cache** bundle (not the direct `SupabaseRepo`). On SIGNED_IN: warm cache (initial `syncOnce` with watermark 0 / claim if cloud empty) → `startSync`; on SIGNED_OUT: `stopSync` + drop the cache bundle. After each `syncOnce`, the store **re-hydrates** from the cache (so background pulls show in the UI). Injected fake repo still wins (test seam).
- [ ] **Step 2 — implement.** Replace A's "signed-in → `_getOrCreateSupabaseRepos()`" with "signed-in → `createCacheRepos(uid)`"; the SupabaseRepo becomes the engine's `remote`. Hook `startSync`/`stopSync` into the existing `subscribeAuth` handler (replacing the direct claim call — claim becomes the warm). Re-hydrate via a post-`syncOnce` callback that re-runs the store's index-from-repo.
- [ ] **Step 3 — run `userland-store.test.ts` (no regression) + commit** `feat(sync): route signed-in store through the cache + engine`.

## Phase 5 — Status UI + toasts

### Task 7: Sync indicator

**Files:** Create `src/components/sync/sync-indicator.tsx`; mount in the shell (sidebar footer near the auth controls). Test (render).

- [ ] Subtle indicator reading `sync-status`: dot + label `Synced`/`Syncing…`/`Offline`/`Sync error`. Gated `isCloudEnabled()` + session. Follow Glass styling. Test: each status renders its label. Commit `feat(ui): sync status indicator`.

### Task 8: Transition toasts

**Files:** Create `src/components/sync/sync-toasts.ts`; wire to the shell. Test.

- [ ] Subscribe to the status transition stream; fire the app's toast primitive for the 4 events ONLY (went-offline / reconnected-synced / persistent-error / first-sync-complete), deduped (no repeat of an already-shown state). Reuse the existing toast component (find it: `grep -ri "toast\|sonner" src/components/ui`). Test: each transition fires once; routine `syncing→synced` fires nothing. Commit `feat(ui): deduped sync transition toasts`.

## Phase 6 — Verify + finish

### Task 9: Full verification + finish branch

- [ ] **Fast lane:** regen routeTree (brief `bun run dev`), `bunx tsc -b`, `bun test` (fast green), `bunx biome check --config-path=. src`.
- [ ] **Integration lane:** with the cloud-vault stack up, run `sync-engine` + cross-device tests green.
- [ ] **Preview smoke:** dev on 6201, sign in; add a card offline (DevTools offline) → indicator=offline, edit queues; go online → flushes, indicator=synced, toast fires; (optional) a second browser profile signed in as the same user sees the change after focus.
- [ ] **Finish:** `superpowers:finishing-a-development-branch` → merge sub-project B to main, remove worktree + branch.

---

## Self-review

- **Spec coverage:** per-user cache ✓(T2) · optimistic dirty writes ✓(T2) · pure reconciler + LWW + binder-merge + tombstones ✓(T1) · pull-reconcile-push cycle + pagination + conditional dirty-clear + watermark ✓(T3) · triggers ✓(T4) · soft-delete flip ✓(T2 cache.remove + T3 push) · status indicator ✓(T7) · 4 deduped toasts ✓(T8) · initial warm = claim ✓(T6) · store↔cache re-hydration ✓(T6) · two-lane testing ✓(T1/T3 + T9). All mapped.
- **Placeholders:** none — exact files + the reconciler contract + test intents. Bodies left to TDD per CLAUDE.md; library call-shapes verified per-task (T3 VERIFY DOCS).
- **Type consistency:** `ReconcileInput`/`Output`, `DirtySet`, `dirtyIds`/`clearDirty`, `syncOnce`/`startSync`/`stopSync`, `createCacheRepos(uid)` used consistently T1→T8. Soft-delete = `deletedAt` set (matches A's column + the reconciler's tombstone check).

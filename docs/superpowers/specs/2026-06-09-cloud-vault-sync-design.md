# Cloud Vault — Multi-device Sync (Sub-project B)

**Date:** 2026-06-09 · **Branch:** `feat/multi-device-sync`
**Status:** design approved; ready for implementation plan.
**Depends on:** Sub-project A (Cloud Vault foundation, merged) — the `updatedAt`
(server-trigger), `deletedAt` tombstone, and client-minted `uuidv7` columns were
added precisely for this.

## Context

A made the Vault work against Postgres when signed in, but **online-only**
(client-direct `SupabaseRepo`, no local cache). B makes signed-in usage
**offline-first and multi-device**: a local cache + a background sync engine
reconciling cache ↔ cloud. Signed-out stays exactly today's local-first Vault.

"The Supabase backend" decomposition: **A — foundation (done)** · **B — sync
(this spec)** · **C — billing (deferred)**.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Sync engine | **Hand-rolled LWW, poll-based** | Small per-user data (thousands of rows) makes full-collection sync cheap; fits the clean repo-port + LWW/tombstone seam already built; **no external sync service** → preserves the self-hosting / "works if the company disappears" thesis. |
| Realtime | **Deferred** (future todo) | Supabase Realtime (Option 3) layers onto the poll cycle later with no rework; you need the reconciling pull regardless. |
| Conflict granularity | **Row-LWW + binder array-merge** | Stacks: whole-row last-write-wins. Binders: union `include`/`exclude` card-ids + merge rules by id, so concurrent membership edits don't lose data. Avoids CRDT complexity. |
| Clock authority | **Server clock** (`updated_at` trigger) | Client clocks drift; LWW realized as **last-*push*-wins** (server-ordered), never comparing client clocks. |
| Cache | **Per-user IDB namespace** (`ptcg-cache-<uid>`) | Separate from the signed-out anonymous Vault; never mixes. |
| Queue model | **Dirty-row, state-based** (not op-log) | The natural fit for LWW — push changed *row states*, not replayed operations; idempotent. |
| Deletes (signed-in) | **Soft-delete** (`deleted_at`) | Tombstones must propagate. Signed-**out** local Vault keeps hard-delete. |
| Status UX | **Subtle indicator + 4 transition toasts** | Indicator = steady state; toasts = notable transitions only (deduped, never on routine passes). |

## Architecture

When signed in, the store stops talking to Postgres directly and talks to a
**local per-user cache**; a background **sync engine** reconciles cache ↔ cloud.

```
store → cache repo (local IDB, per-uid) ⇄ sync engine ⇄ SupabaseRepo (cloud)
```

- **Per-user cache** (`ptcg-cache-<uid>` stores) — a local mirror of the cloud
  Vault. Selectors read it → reads work offline; it's the offline source of truth.
  Separate from the signed-out `ptcg-collection` Vault.
- **Optimistic writes** — a signed-in edit applies to the cache instantly + marks
  the row `dirty`; the engine pushes dirty rows in the background.
- **`SupabaseRepo` demoted to "the remote"** — A's adapter is no longer what the
  store talks to; it's what the sync engine pushes/pulls against. `getRepos()`
  signed-in now returns the **cache** bundle.
- **Soft-delete flip** — signed-in cache + cloud set `deleted_at` (the local
  `SupabaseRepo`/cache delete becomes soft) so tombstones propagate. Signed-out
  IDB Vault unchanged (hard delete).
- **Initial cache warm** unifies with A's claim: on sign-in, warm the cache from
  cloud (paginated); if the cloud is empty, push the local Vault up (the claim).

## Reconciliation (the core)

**Clock:** server-authoritative `updated_at` (A's trigger). LWW = **last-push-wins**
(whichever device syncs later by server time). Local edit time is only a
"dirty-since-last-sync" marker. For a personal collection, last-push-wins ≈
last-edit-wins in practice.

**The reconciler is a PURE function** — `(cacheState, pulledRows, dirtySet) →
(mergedCache, rowsToPush, newWatermark)` — a deterministic reducer, exhaustively
unit-tested. The engine (network, triggers, status) is a thin I/O shell.

**One sync pass:**
1. **Pull** cloud rows where `updated_at > lastSyncedAt` (incl. tombstones),
   paginated (Supabase caps queries at 1000 rows).
2. **Reconcile** each pulled row vs the cache:
   - cache row **not dirty** (or absent) → accept the cloud row (newer than our
     watermark); a tombstone removes it from the cache view.
   - cache row **dirty** → conflict:
     - **stack** → keep local dirty (it pushes next, wins by server time).
     - **binder** → **array-merge** cloud + local (union include/exclude card-ids,
       merge rules by id; **exclude wins** in membership), result stays dirty.
3. **Advance** `lastSyncedAt` to the pull's server time.
4. **Push** dirty rows (upserts + tombstones + merged binders); the trigger stamps
   server `updated_at`; clear `dirty` **conditionally** — only for rows unchanged
   since the push snapshot (a row edited mid-pass stays dirty → next pass). Failed
   rows stay dirty → retried (idempotent upserts). Advance the watermark past
   pushed rows' new timestamps to avoid re-pulling our own writes.

## Triggers + status UX

**Triggers:** `online`/reconnect (treat fetch failures as offline; `navigator.onLine`
lies) · app focus / tab visible · debounced post-write (~1–2s when online) ·
sign-in (warm). No polling interval for MVP.

**Status indicator** (subtle, e.g. sidebar footer): `offline` (writes queue, UI
usable) · `syncing` · `synced` · `error` (will retry).

**Transition toasts** (deduped, fired on *transition* only — never routine passes):
- Went offline → "You're offline. Changes save locally and sync when you reconnect."
- Reconnected + caught up → "Back online — changes synced." (only after an offline stretch)
- Persistent sync error → "Couldn't sync — retrying." (after repeated failures)
- First-sign-in sync complete → one-time "Your Vault now syncs across devices."

NO toast on routine `syncing → synced`, per-row pushes, or transient single
failures. Reuse the app's existing toast primitive (shadcn/radix — confirm at impl).

Conflicts resolve **silently** (LWW); surfacing them is a deferred trust feature.

## Edge cases (handled)

- **Writes during a pass** — conditional `dirty`-clear (only rows unchanged since
  the push snapshot); a mid-pass edit survives.
- **Initial-warm pagination** — paginate the warm pull (>1000 rows plausible).
- **Echo of own pushes** — advance watermark past pushed rows; harmless if re-pulled.
- **Tombstone vs edit (resurrection)** — edit-after-delete resolves by last-push-wins:
  a later edit sets `deleted_at = null` and resurrects. Expected LWW behavior.
- **Binder merge precedence** — union include + exclude, **exclude wins** in
  membership (matches the hybrid model; "remove" = add-to-exclude).
- **Sign-out mid-sync** — abort; per-uid cache retains unpushed dirty rows for next
  sign-in. User returns to the separate signed-out Vault.

## Store ↔ cache wiring

Selectors read the userland store, hydrated from `getRepos()`. Signed-in, that's
the cache bundle. A background pull mutates the cache → the store must reflect it:
re-hydrate the store after a sync pass (or have the store subscribe to cache
changes). A plan-level wiring detail; keep the existing `setUserlandRepos` /
`usingInjectedRepos` test seam intact.

## Testing

- **Fast (no network):** the pure reconciler — table-driven unit tests for every
  LWW / binder-merge / tombstone / conditional-dirty-clear / watermark case. This
  is the core correctness surface.
- **Integration (local Supabase, cloud-vault stack on :55321):** two simulated
  devices (two caches + one cloud) — A writes→syncs, B syncs→sees it; conflict
  (both edit → last-push-wins); binder concurrent membership (union, no loss);
  tombstone propagation; offline-queue flush on reconnect. Skip-if-unreachable.
- **Offline sim:** mock online/offline + fetch failures → assert writes queue +
  flush on reconnect; status transitions + toast dedup.

## Out of scope (deferred)

Realtime live updates (Option 3 — future) · conflict-surfacing UI · field-level /
CRDT merge · tombstone GC/retention (keep tombstones for MVP, small data) ·
cross-entity transactions · billing (C).

## Success criteria

- Signed-in + offline → full read **and** write (queues, UI usable, indicator = offline).
- Reconnect → queue flushes, remote pulls in, indicator → synced, the toast fires once.
- Two devices: edit on A → shows on B after B's next trigger.
- Conflict → last-push-wins (stacks); binder membership unioned (no loss). Delete on
  A → tombstone → gone on B.
- Signed-out → today's local-first Vault, unchanged.

## Phased delivery (for the plan)

1. Per-user cache + the pure reconciler + offline **reads** (cache warm; store reads cache).
2. Write queue + push + the full pull→reconcile→push cycle + soft-delete flip.
3. Status indicator + transition toasts.

(Realtime = its own future effort, layered on later.)

## Risks (accepted, documented)

- **Last-push-wins ≠ true last-edit-wins** — the client-clock-skew tradeoff. For
  rare concurrent multi-device edits on a personal collection, indistinguishable.
- **Edit-after-delete resurrects** — accepted LWW semantics.
- **Store↔cache reactivity** — must re-hydrate/subscribe after background pulls;
  the fiddliest wiring point.

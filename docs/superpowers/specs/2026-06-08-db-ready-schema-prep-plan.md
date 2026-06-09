# DB-ready schema prep (pre-Supabase)

**Date:** 2026-06-08 · **Branch:** `schema/db-ready-prep`

Front-load schema decisions into the local IndexedDB layer **now**, while changes
are cheap (read-time backfill + one marked migration), before the Supabase adapter
turns them into permanent migration files.

User decisions (locked):
- **Money:** integer **cents** (minor units) + per-stack **`currency`** field (ISO 4217).
- **Sync:** ongoing sync target → **`deletedAt` tombstone** field on every entity now.
- **Bucket-1:** all three — **UUIDv7** ids, **`Stack.updatedAt`**, normalize the two
  `?`-optional fields (`label`, `isPrimary`) to always-present.

## Assumptions (judgement calls made on the user's behalf)

1. **No currency picker UI this pass.** `currency` is added to the schema and
   defaults to `"USD"`; it travels through forms/CSV/snapshots. A selector is
   additive and deferred. (Reduces ripple to forms.)
2. **Local `remove()` stays a hard delete.** The `deletedAt` slot is *reserved for
   the future sync adapter* (which owns soft-delete + tombstone propagation). Today
   there is no second device to propagate to, and keeping tombstones in IDB forever
   has no local consumer. `deletedAt` is therefore always `null` in locally-written
   rows; the column exists so snapshots/sync can carry it. Flipping local delete to
   soft is a one-liner later.
3. **`user_id` is NOT stored locally.** Single local user, no auth uid yet. The
   remote adapter stamps `user_id` from the session on sync/import; import paths
   tolerate its absence. (Pure overhead to store the same sentinel on every row.)
4. **Unit migration is version-marked, not value-sniffed.** A stored `pricePaid`
   of `3.5` is ambiguous (dollars or cents?). Convert dollars→cents exactly once,
   gated by a persisted data-version marker — never in `normalizeStack` (which runs
   every read and must stay idempotent).

## Mapping intent (Postgres, when the adapter lands)

- camelCase → snake_case at the adapter (uniform mapper). ms-epoch `number` →
  `timestamptz`. `pricePaid` cents → `integer` (or `numeric`); `currency` → `text`.
- Every table: `user_id uuid not null references auth.users(id)`, **indexed**, RLS
  `using ((select auth.uid()) = user_id)` (the `(select …)` wrap = per-statement, not per-row).
- Binder nested arrays → `rules jsonb` + `include_card_ids text[]` + `exclude_card_ids text[]`
  (binder always loaded whole; rules stay client-evaluated/opaque). GIN index only if
  reverse-querying "which binders contain card X".
- `grading {company,grade}` → flatten to `grading_company` + `grading_grade` (queryable).
- UUIDv7 client-minted id = the PG PK (time-ordered → no v4 index fragmentation).

## Phases

- **A. uuidv7 minter** — new `src/store/userland/uuid.ts` (`uuidv7()`) + test. Replace the
  3 userland `crypto.randomUUID()` sites (fillStack, fillBinder, addRuleToBinder).
- **B. types.ts** — Stack: +`updatedAt:number`, +`deletedAt:number|null`, +`currency:string`;
  `label`/`isPrimary` → always-present; pricePaid doc = cents. EditableStackFields +`currency`.
  Binder/Profile +`deletedAt`. UserDataSnapshot `schemaVersion: 4`.
- **C. idb-repo.ts** — fillStack/fillBinder/profile.save fill new fields (uuidv7); normalizeStack
  backfills new fields (NOT pricePaid); exportAll v4. New `ptcg-meta` store +
  `migrateUserlandData()` (dollars→cents + backfill, gated on `userlandDataVersion < 4`).
  Simplify addStack isPrimary patch-dance (fillStack now persists it).
- **D. backup.ts** — SUPPORTED_VERSIONS ⊇ {1,2,3,4}; upgrade() targets v4 (dollars→cents for
  v<4, passthrough for v4); upgradeProfile +deletedAt.
- **E. consumers (cents-aware)** — stats.ts (cents), vault-summary.tsx + stack-row.tsx (÷100 display),
  stack-form-mapping.ts (dollars↔cents at boundary), stack-edit-form.tsx (currency default),
  csv.ts (export/import dollars↔cents + currency column), userland-store.ts (uuidv7 rule id).
  No-ops: share.ts (excludes pricePaid), card-rows.ts (sort unit-invariant).
- **F. test-utils.tsx** — makeStack defaults (currency/updatedAt/deletedAt/isPrimary/label), snapshot v4.
- **G. verify** — `bun test` + `bunx tsc -b` + biome; fix fallout.
- **H. merge** to main, remove worktree + branch.

# Plan 004: Close two small async races (offline-detail re-enable; profile lost-update)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If any
> STOP condition occurs, stop and report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat 5fe6f08..HEAD -- src/store/corpus/detail-runtime.ts src/store/userland/idb-repo.ts src/store/userland/sync/cache-repo.ts`
> On any change since `5fe6f08`, compare "Current state" excerpts; mismatch = STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (green test baseline)
- **Category**: bug
- **Planned at**: commit `5fe6f08`, 2026-07-02

## Why this matters

Two check-then-act windows exist across `await` boundaries. (a) `syncDetail()` can re-download and re-enable offline card detail after the user disabled it mid-request — acting against explicit user intent. (b) `profile.save()` is a read-merge-write without serialization in BOTH repo implementations; two overlapping saves (UI edit + sync engine) can drop one caller's patch (lost update). Both fixes are small, mechanical, and testable.

## Current state

### (a) `src/store/corpus/detail-runtime.ts:124-135`

```ts
export async function syncDetail(): Promise<void> {
    try {
        const { version } = await fetchVersion();
        if (version === useDetailRuntime.getState().version) {
            useDetailRuntime.setState({ status: "ready" });
            return;
        }
        await enableOffline();
    } catch {
        useDetailRuntime.setState({ status: "error" });
    }
}
```

If the user disables the offline feature while `fetchVersion()` is in flight, state `version` becomes null/changed, the equality check fails, and `enableOffline()` re-downloads and re-enables. The store exposes an `enabled` flag (see `checkStale()` at `:138-148`, which already guards on `getState().enabled` — that is the convention to match).

### (b) `src/store/userland/idb-repo.ts:209-227` (and the same shape in `src/store/userland/sync/cache-repo.ts` around `:359-377`)

```ts
async save(patch) {
    const now = Date.now();
    const existing = await get<Profile>(LOCAL_PROFILE_ID, store);
    const next: Profile = existing ? { ...existing, ...patch, updatedAt: now } : { ...defaults... };
    await set(LOCAL_PROFILE_ID, next, store);
    return next;
},
```

Two overlapping `save()` calls both read the same `existing`, then the second `set` overwrites the first's merge — one patch silently lost. `idb-keyval` exposes no multi-op transaction here; per-repo promise-chain serialization is the minimal fix.

Repo conventions: interfaces over types for object shapes; optional fields `null` never `undefined`; tests inject fake repos via `setUserlandRepos()` + `resetUserlandForTests()`; store tests live next to the store files.

## Commands you will need

| Purpose   | Command                                              | Expected |
|-----------|-------------------------------------------------------|----------|
| Tests     | `bun test src/store`                                  | 0 fail   |
| Full tests| `bun test`                                            | 0 fail (after plan 001) |
| Typecheck | `bunx tsc -b`                                         | exit 0 (if `routeTree.gen.ts` missing: boot `bun run dev` ~15s to regenerate, retry) |
| Lint      | `bunx biome check --config-path=. src/store`          | no errors |

## Scope

**In scope**:
- `src/store/corpus/detail-runtime.ts` + `src/store/corpus/detail-runtime.test.ts`
- `src/store/userland/idb-repo.ts` + `src/store/userland/idb-repo.test.ts`
- `src/store/userland/sync/cache-repo.ts` + `src/store/userland/sync/cache-repo.test.ts`

**Out of scope**:
- `supabase-repo.ts` — server-side upsert has its own semantics; don't touch.
- The dirty-set logic in cache-repo (`markDirty`/`clearDirty`) — reviewed and intentionally left as-is (conditional clearDirty already guards it).
- `enableOffline()` itself — user-initiated; no guard needed there.

## Steps

### Step 1: Guard syncDetail on `enabled`

After the `await fetchVersion()` (and before `enableOffline()`), bail if `!useDetailRuntime.getState().enabled` — mirror the `checkStale()` guard style. Decide with the code in front of you whether the early-bail should also skip the `status: "ready"` write when disabled (it should — a disabled feature has no sync status to report).

**Verify**: `bun test src/store/corpus` → 0 fail.

### Step 2: Test the syncDetail race

In `detail-runtime.test.ts`, add a case following the file's existing fetch-stubbing pattern (read the file first; it stubs `fetch`/module fns — match it): start `syncDetail()`, flip the store to disabled while the version fetch is pending (e.g. stub `fetchVersion` with a controllable promise), resolve, and assert no download happened and `enabled` stays `false`.

**Verify**: `bun test src/store/corpus/detail-runtime.test.ts` → 0 fail, new test passes.

### Step 3: Serialize profile.save in both repos

In each repo factory, add a local `let saveQueue: Promise<unknown> = Promise.resolve();` and wrap the existing save body: chain onto `saveQueue` so saves execute strictly one-after-another and each returns its own `next`. Keep the public signature identical. (Failure isolation: a rejected save must not poison the queue — chain with `.catch(() => {})` when extending the queue but still propagate the rejection to that call's caller.)

**Verify**: `bun test src/store/userland` → 0 fail.

### Step 4: Test the lost-update

In `idb-repo.test.ts` (and mirrored in `cache-repo.test.ts`): fire `Promise.all([save({displayName:"A"}), save({bio:"B"})])`, then `get()` and assert BOTH fields landed. (Without step 3 this fails intermittently/deterministically depending on interleaving — it must pass deterministically after.)

**Verify**: `bun test src/store/userland/idb-repo.test.ts src/store/userland/sync/cache-repo.test.ts` → 0 fail, new tests pass.

## Test plan

Covered in steps 2 & 4; model new tests on the existing patterns in the same files (fake-indexeddb is preloaded via bunfig; use fresh store names per test like neighbors do — `crypto.randomUUID()` is the convention for ephemeral test store names).

## Done criteria

- [ ] `bun test src/store` → 0 fail; 3 new tests exist (syncDetail race, idb profile concurrency, cache profile concurrency)
- [ ] `bunx tsc -b` → exit 0
- [ ] `bunx biome check --config-path=. src/store` → no errors
- [ ] Only in-scope files modified

## STOP conditions

- `detail-runtime.test.ts` has no stubbing seam for `fetchVersion` (i.e. it's not stubbable without modifying the runtime module's exports) — report the seam problem instead of restructuring the module.
- Excerpts don't match live code.
- A verification fails twice.

## Maintenance notes

- When the Supabase sync adapter starts writing profiles, revisit: last-write-wins on `updatedAt` is the documented merge key; the queue serializes local writes only.
- Reviewer: check the queue doesn't swallow rejections (each caller still sees its own failure).

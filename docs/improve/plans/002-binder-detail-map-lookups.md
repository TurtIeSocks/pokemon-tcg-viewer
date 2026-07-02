# Plan 002: Binder rule labels resolve via Maps, not 20k-card scans

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If any
> STOP condition occurs, stop and report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat 5fe6f08..HEAD -- src/components/binders/binder-detail.tsx`
> On any change to in-scope files since `5fe6f08`, compare "Current state"
> excerpts against live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (001 recommended first for a green baseline)
- **Category**: perf
- **Planned at**: commit `5fe6f08`, 2026-07-02

## Why this matters

`binder-detail.tsx` builds two "resolver" closures whose lookups are linear scans: dex-number → name scans `index.cards` (~20k cards) with `.find()`, and setId → name scans the merged all-region sets list. Each binder rule label executes these per render, so a binder with several dex rules does multiple full-corpus scans on mount and on every corpus/i18n change — main-thread blocking on low-end devices. Map-backed lookups make each O(1) with one O(n) build memoized per index change.

## Current state

`src/components/binders/binder-detail.tsx:88-118` (verified at `5fe6f08`):

```tsx
const dexNameResolver = useMemo(
    () =>
        (n: number): string | undefined => {
            if (!index) return undefined;
            return index.cards.find((c) => c.nationalPokedexNumbers?.includes(n))
                ?.name;
        },
    [index],
);

const setNameResolver = useMemo(
    () =>
        (setId: string): string | undefined =>
            allSets.find((s) => s.id === setId)?.name,
    [allSets],
);

const memberCards = useMemo(() => {
    if (!memberIds || allSets.length === 0) return [];
    const sb = setsById(allSets);
    ...
}, [memberIds, indices, allSets, i18n]);
```

- The resolvers are passed to `binderRuleLabel(...)` further down (`binder.rules.map` around lines 221–234). Keep the resolver **function signatures unchanged** — only back them with Maps.
- `setsById(allSets)` (imported from the userland selectors / corpus-engine helpers) already builds a `Map`-like id→set structure inside the `memberCards` memo. Reuse one hoisted instance for both `memberCards` and `setNameResolver`.
- Semantics to preserve: `.find()` returns the FIRST card matching a dex number. When building the dex→name Map, keep first occurrence (`if (!map.has(n)) map.set(n, c.name)`), iterating `index.cards` in order, over every entry of `c.nationalPokedexNumbers ?? []`.
- Repo conventions: manual `useMemo` is intentional (React Compiler is on, but the codebase memoizes by hand — match that). Optional values are `null`/`undefined` per existing signatures — resolvers return `string | undefined`; keep that.

## Commands you will need

| Purpose   | Command                                                    | Expected |
|-----------|------------------------------------------------------------|----------|
| Tests     | `bun test src/components/binders`                          | 0 fail   |
| Full tests| `bun test`                                                 | no NEW fails vs baseline (4 known order-dependent fails may exist until plan 001 lands) |
| Typecheck | `bunx tsc -b`                                              | exit 0 (if `routeTree.gen.ts` missing: boot `bun run dev` ~15s to regenerate, retry) |
| Lint      | `bunx biome check --config-path=. src/components/binders`  | no errors |

## Scope

**In scope**:
- `src/components/binders/binder-detail.tsx`
- `src/components/binders/binder-detail.test.tsx` (add coverage only if a resolver behavior test doesn't exist)

**Out of scope**:
- `binderRuleLabel` / binder-progress selectors — signatures stay as-is.
- Corpus stores/selectors — do not add global caches there in this plan.
- `memberCards` resolution loop (`resolveCardAcrossRegions`) — bounded cost, leave it.

## Steps

### Step 1: Hoist a shared sets-by-id Map

Add `const setById = useMemo(() => setsById(allSets), [allSets]);` above the resolvers; use it inside `setNameResolver` (`setById.get(setId)?.name`) and pass it into the `memberCards` memo instead of rebuilding there (add `setById` to that memo's dep array, drop the inner `setsById` call — `allSets` can then leave that dep array only if it's otherwise unused there; check remaining uses like `allSets.length === 0` and keep deps accurate).

**Verify**: `bun test src/components/binders` → 0 fail.

### Step 2: Back dexNameResolver with a Map

Inside a `useMemo` keyed on `[index]`, build `Map<number, string>` by iterating `index.cards` once (first-occurrence-wins per dex number, as specified above). `dexNameResolver` becomes a stable closure doing `map.get(n)`.

**Verify**: `bun test src/components/binders` → 0 fail.

### Step 3: Full gates

**Verify**: `bunx tsc -b` exit 0; `bunx biome check --config-path=. src/components/binders` clean; `bun test` no new failures.

## Test plan

- If `binder-detail.test.tsx` already asserts rule-label text for dex/set rules (check first), no new tests needed — those are the characterization tests.
- If not covered: add one test rendering a binder with a dex rule + a set rule and asserting the label text resolves to the card/set names, modeled after existing cases in `src/components/binders/binder-detail.test.tsx`. Remember the repo convention: pre-seed `useCorpusRuntime.setState({ index: buildIndex([...]) })` so no network is touched.

## Done criteria

- [ ] `grep -n "cards.find" src/components/binders/binder-detail.tsx` → no matches
- [ ] `grep -n "allSets.find" src/components/binders/binder-detail.tsx` → no matches
- [ ] `bun test src/components/binders` → 0 fail
- [ ] `bunx tsc -b` → exit 0
- [ ] Only in-scope files modified

## STOP conditions

- `binderRuleLabel` turns out to need the resolvers' identity to change per render (it shouldn't — but if tests fail on stale labels after memoization, stop and report).
- Excerpts above don't match live code.
- Verification fails twice on the same step.

## Maintenance notes

- If regions grow or a "dex name" needs locale awareness later, the dex→name Map is the single place to extend.
- Reviewer: check memo dep arrays are exact (no stale `allSets` capture).

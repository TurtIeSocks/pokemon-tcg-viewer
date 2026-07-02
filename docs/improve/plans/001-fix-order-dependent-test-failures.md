# Plan 001: Full `bun test` run passes deterministically (fix cross-file test pollution + format drift)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat 5fe6f08..HEAD -- src/lib/version-check src/store src/lib/billing`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `5fe6f08`, 2026-07-02

## Why this matters

A full `bun test` run currently fails 4 tests that pass in isolation — the suite is order-dependent, so every future change is verified against a red baseline and real regressions can hide behind "those 4 always fail". This is the verification baseline for every other plan; it must land first. Separately, 4 files fail `biome check` formatting on main (drift), which pollutes future diffs.

## Current state

Observed on commit `5fe6f08` (verified 2026-07-02):

- `bun test` (full run, 153 files): `1414 pass, 4 fail`. The 4 failures are all in `src/lib/version-check/use-version-available.test.ts`:
  - "a focus event triggers a re-check" (~1003ms — waitFor timeout)
  - "does not poll on an interval while the tab is hidden" (~1005ms)
  - "becoming visible starts the interval" (~1004ms)
  - "disabled hook never fetches" (~42ms)
- `bun test src/lib/version-check` in isolation: `18 pass, 0 fail`.
- Pairwise runs already tried and NOT reproducing (all green):
  - `bun test src/lib/billing/entitlement.test.ts src/lib/version-check/use-version-available.test.ts`
  - `bun test src/store/sets-slice.test.ts src/lib/version-check/use-version-available.test.ts`
  - `bun test src/store/userland/sync/sync-triggers.test.ts src/lib/version-check/use-version-available.test.ts`
- The hook under test (`src/lib/version-check/use-version-available.ts`) uses: `fetch`, `setInterval`, `document.visibilityState`, `visibilitychange` + window `focus` listeners, and the global `__APP_VERSION__`.
- Known repo gotcha (documented in project notes): **bun `mock.module` poisons later test files** — prefer `spyOn`. Files still using `mock.module`: `src/lib/billing/entitlement.test.ts`, `src/store/sets-slice.test.ts`.
- Likely pollution classes to hunt: unrestored `fetch` spy/mock, `document.visibilityState` left redefined (e.g. `"hidden"`), leaked `setInterval`/event listeners keeping fake state alive, leaked `__APP_VERSION__`, or `mock.module` residue.
- Biome format drift: `bunx biome check --config-path=. src` reports **4 format errors + 3 warnings**. Two known files: `src/store/userland/id-remap.test.ts` and a test asserting `f.pokemon.map((p) => p.dex)` (find via the check output). Identify all from the command output.

## Commands you will need

| Purpose   | Command                                        | Expected on success |
|-----------|------------------------------------------------|---------------------|
| Tests     | `bun test`                                     | 0 fail              |
| One file  | `bun test <path> [<path>...]`                  | 0 fail              |
| Lint      | `bunx biome check --config-path=. src`         | no errors           |
| Format    | `bunx biome check --write --config-path=. <files>` | files fixed     |
| Typecheck | `bunx tsc -b`                                  | exit 0 (if it errors on `routeTree.gen.ts` missing: boot `bun run dev` for ~15s to regenerate, then retry) |

## Scope

**In scope** (modify only what the bisect implicates):
- The polluting test file(s) you identify (add proper cleanup: `afterEach`/`afterAll` restore of globals, spies, timers, listeners).
- `src/lib/version-check/use-version-available.test.ts` — ONLY if it needs defensive setup (e.g. re-asserting visibility in `beforeEach`); do not weaken any assertion.
- The 4 files with biome format errors (run `--write` on exactly those files).

**Out of scope**:
- `src/lib/version-check/use-version-available.ts` (the hook itself) — the bug is test hygiene, not the hook. If you become convinced the hook is at fault, STOP and report.
- `bunfig.toml`, `src/test-setup.ts` — global test config changes need review; STOP and propose instead.
- Skipping/quarantining the 4 tests — not acceptable.

## Steps

### Step 1: Reproduce and bisect

Confirm: `bun test` → 4 fail in use-version-available.test.ts. Then bisect: get the file list with `find src -name '*.test.*' | sort`, and run `bun test <half of files> src/lib/version-check/use-version-available.test.ts` narrowing halves until you find the minimal polluter set. Bun accepts multiple explicit file paths. (Pollution may require 2+ files in combination — if halves both pass, split differently or accumulate prefixes in file order.)

**Verify**: a minimal file combination that makes the version-check tests fail. Record it.

### Step 2: Identify and fix the leak

Read the polluter(s); find what global state survives the file (fetch spy not restored, `Object.defineProperty(document, "visibilityState", ...)` without restore, `mock.module` residue, unclosed interval/listener, `__APP_VERSION__`). Fix by restoring in `afterEach`/`afterAll` in the polluter. Follow the cleanup pattern in `src/lib/version-check/use-version-available.test.ts:19-28` (beforeEach/afterEach restore).

**Verify**: the Step-1 minimal combination now passes.

### Step 3: Fix format drift

`bunx biome check --config-path=. src` → run `--write` on exactly the files with format errors. Read the 3 warnings; fix only if trivial and clearly safe, otherwise list them in your report.

**Verify**: `bunx biome check --config-path=. src` → no errors.

### Step 4: Full-suite determinism check

Run `bun test` three times consecutively.

**Verify**: all three runs → `0 fail` (sync-engine tests that self-skip without a local Supabase stack are fine — skips are not failures).

## Test plan

No new tests. The deliverable is: existing suite deterministic. If the fix warrants a guard (e.g. polluter's helper now restores state), keep it inside the polluting test file.

## Done criteria

- [ ] `bun test` → 0 fail, three consecutive runs
- [ ] `bun test src/lib/version-check` → 18 pass
- [ ] `bunx biome check --config-path=. src` → no errors
- [ ] Diff touches only test files (+ formatting-only changes)

## STOP conditions

- The 4 failures don't reproduce on a fresh full run (environment flake — report, don't fix blind).
- Bisect points at `bunfig.toml`/`test-setup.ts` preload as root cause.
- The hook itself (`use-version-available.ts`) appears buggy.
- A fix attempt fails verification twice.

## Maintenance notes

- Any new test file touching `document.visibilityState`, `fetch` spies, `mock.module`, or intervals must restore them in `afterEach` — that's the class of bug here.
- Reviewer: check the fix restores state rather than re-ordering tests or loosening assertions.

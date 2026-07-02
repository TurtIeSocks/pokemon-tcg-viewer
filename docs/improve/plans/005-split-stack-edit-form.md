# Plan 005: Split stack-edit-form.tsx below the ~500-line convention (DEFERRED)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If any
> STOP condition occurs, stop and report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat 5fe6f08..HEAD -- src/components/collection/stack-edit-form.tsx`
> On drift, re-scope from the live file before extracting anything.

## Status

- **Priority**: P3 (deferred — execute only on explicit request)
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001
- **Category**: tech-debt
- **Planned at**: commit `5fe6f08`, 2026-07-02

## Why this matters

`src/components/collection/stack-edit-form.tsx` is 694 lines against the repo's stated ~500-line split convention. It's the Vault's core mutation form (variant/condition/grading/price fields), high-churn, and increasingly hard to review. Splitting field groups into sibling components restores reviewability. Deferred because it's churn with regression risk on a working form and no user-visible payoff — land it opportunistically, not urgently. (`src/components/ui/sidebar.tsx` at 729 lines was considered and REJECTED for splitting: vendored shadcn primitive; diverging from upstream makes future regeneration harder.)

## Current state

- `src/components/collection/stack-edit-form.tsx` — 694 lines; TanStack Form with render-prop `children` per field (biome `noChildrenProp` suppressed per-field — preserve those suppressions); constant tables (`WESTERN_LANGUAGES`, `ASIAN_LANGUAGES`, conditions, graders — verify exact names in the file) plus multiple field-group sections in one file.
- Conventions that bind this refactor: components split into a sibling directory `feature/` with one file per sub-component once over ~500 lines; non-component exports (hooks/constants/types) go in a sibling `.ts` file (react-refresh `only-export-components` hygiene); TanStack Form fields read `value={x ?? ""}` at the boundary and map empty → `null` before persisting; money via `src/store/userland/money.ts` helpers only.
- `stack-form-schema.ts` / `stack-form-mapping.ts` already exist as extracted pure modules — follow that precedent.

## Commands you will need

| Purpose   | Command                                                        | Expected |
|-----------|-----------------------------------------------------------------|----------|
| Tests     | `bun test src/components/collection`                            | 0 fail   |
| Typecheck | `bunx tsc -b`                                                   | exit 0 (if `routeTree.gen.ts` missing: boot `bun run dev` ~15s to regenerate, retry) |
| Lint      | `bunx biome check --config-path=. src/components/collection`    | no errors |

## Scope

**In scope**: `src/components/collection/stack-edit-form.tsx`, new `src/components/collection/stack-edit-form/` directory (sub-components + a `-constants.ts`), `stack-edit-form.test.tsx` import updates only.

**Out of scope**: any behavior/markup/validation change; `stack-form-schema.ts` / `stack-form-mapping.ts`; `stack-manager.tsx`.

## Steps (sketch — re-derive precise cut lines from the live file)

1. Extract constant tables → `stack-edit-form/constants.ts`. Verify: tests green.
2. Extract each cohesive field-group JSX block into `stack-edit-form/<group>-fields.tsx`, passing the `form` instance down (keep TanStack Form generics happy — if generics fight the extraction, type the prop with the inferred `typeof form` pattern used elsewhere or STOP). Verify after each extraction: `bun test src/components/collection` → 0 fail.
3. Final gates: typecheck, lint, full `bun test`.

## Test plan

No new tests — `stack-edit-form.test.tsx` (401 lines) is the characterization suite; it must pass unchanged (import paths may update; assertions must not).

## Done criteria

- [ ] `wc -l src/components/collection/stack-edit-form.tsx` → < 500
- [ ] `bun test src/components/collection` → 0 fail with assertions unchanged
- [ ] `bunx tsc -b` → exit 0; biome clean
- [ ] Only in-scope files modified

## STOP conditions

- TanStack Form generics make extracted field-group props unrepresentable without `any` — stop, report the typing wall.
- Any existing test assertion needs changing to pass — that means behavior drifted; stop.

## Maintenance notes

- After the split, new fields go into the matching group file; the parent should stay composition-only.

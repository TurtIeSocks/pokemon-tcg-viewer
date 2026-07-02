# Plan 003: One shared card-thumbnail src helper (kills the fallback drift + command-palette blank images)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If any
> STOP condition occurs, stop and report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat 5fe6f08..HEAD -- src/components/shell/command-palette.tsx src/components/vault/owned-missing-grid.tsx src/components/islands/holo-card-island.tsx src/components/holo-card`
> On any change since `5fe6f08`, compare "Current state" excerpts; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug + tech-debt
- **Planned at**: commit `5fe6f08`, 2026-07-02

## Why this matters

The "small image with fallback to full image" chain is re-implemented at every thumbnail surface. Three sites coalesce (`imageUrlSmall ?? imageUrl`), but the command palette uses `card.imageUrlSmall` bare — cards without a small image (legitimate for some old/Asian-catalog cards) render a broken/blank `<img>` in palette results. A one-line shared helper fixes the bug and prevents the next copy from drifting again. (Audit context: the heavy renderer — HoloCard — is already properly shared between grid and page/modal; this drift at the thumbnail edges was the real DRY gap.)

## Current state

- `src/components/shell/command-palette.tsx:213` and `:251` — `<img src={card.imageUrlSmall} alt="" loading="lazy" ...>` — **no fallback** (the bug). Two identical card-row blocks ("Cards" results, "Recently viewed").
- `src/components/vault/owned-missing-grid.tsx:66` — `const src = card.imageUrlSmall ?? card.imageUrl;` (correct, duplicated logic).
- `src/components/islands/holo-card-island.tsx:15` — `src={imageUrlSmall ?? imageUrl}` in the SSR fallback `<img>` (correct, duplicated logic).
- Card image types live in `src/components/holo-card/types.ts` (`HoloCardData` has `imageUrl` / `imageUrlSmall`); the holo-card package has an `index.ts` barrel. There is also a `nonEmptyUrl` helper used by HoloCard/set-tile (grep `nonEmptyUrl` to find it) that treats empty strings as absent — read it before writing the helper and match its semantics if it's what HoloCard uses for this same cascade.
- Repo conventions: non-component exports live in plain `.ts` files (never in a `.tsx` alongside a component); optional fields are `null`, never `undefined`.

## Commands you will need

| Purpose   | Command                                                  | Expected |
|-----------|----------------------------------------------------------|----------|
| Tests     | `bun test src/components`                                | 0 fail   |
| Full tests| `bun test`                                               | no NEW fails vs baseline (4 known order-dependent fails may exist until plan 001 lands) |
| Typecheck | `bunx tsc -b`                                            | exit 0 (if `routeTree.gen.ts` missing: boot `bun run dev` ~15s to regenerate, retry) |
| Lint      | `bunx biome check --config-path=. src/components`        | no errors |

## Scope

**In scope**:
- `src/components/holo-card/card-thumb-src.ts` (create) + export from `src/components/holo-card/index.ts`
- `src/components/holo-card/card-thumb-src.test.ts` (create)
- `src/components/shell/command-palette.tsx` (two `<img>` src fixes)
- `src/components/vault/owned-missing-grid.tsx` (swap to helper)
- `src/components/islands/holo-card-island.tsx` (swap to helper)

**Out of scope**:
- `src/components/holo-card/holo-card.tsx` — its internal multi-stage image FSM (localized→EN→error states) is a different, richer mechanism; do NOT refactor it onto this helper.
- `species-tile.tsx`, `set-tile.tsx` — sprites/logos, not card thumbnails.
- Any visual/layout change; `alt` attributes stay exactly as they are today at each site.

## Steps

### Step 1: Create the helper

`src/components/holo-card/card-thumb-src.ts`:

```ts
import type { HoloCardData } from "./types";

/** Small-thumbnail src with fallback to the full image (empty string counts as absent). */
export function cardThumbSrc(
    card: Pick<HoloCardData, "imageUrl" | "imageUrlSmall">,
): string { /* coalesce small → full, treating null/undefined/"" as absent; return "" only if both absent */ }
```

Match `nonEmptyUrl` semantics if the codebase already defines them (grep first; reuse the function if it's importable without a cycle). Adjust the `Pick<>` types to the actual field nullability in `types.ts`. Export from the holo-card `index.ts` barrel.

**Verify**: `bunx tsc -b` → exit 0.

### Step 2: Adopt at the four call sites

- `command-palette.tsx:213` and `:251`: `src={cardThumbSrc(card)}`.
- `owned-missing-grid.tsx:66`: `const src = cardThumbSrc(card);`
- `holo-card-island.tsx:15`: `src={cardThumbSrc({ imageUrl, imageUrlSmall })}`.

Nothing else about those elements changes.

**Verify**: `bun test src/components` → 0 fail.

### Step 3: Regression test

`card-thumb-src.test.ts`: (a) small present → small; (b) small null/absent → full; (c) small empty-string → full (if step 1 adopted nonEmptyUrl semantics); (d) both absent → "". Model structure on a neighboring pure-fn test, e.g. `src/components/holo-card/cdn-image.test.ts`.

**Verify**: `bun test src/components/holo-card` → 0 fail, new tests pass.

## Test plan

Covered by Step 3. No corpus/network involvement (pure function), so no store pre-seeding needed.

## Done criteria

- [ ] `grep -rn "imageUrlSmall ?? " src/components --include='*.tsx'` → no matches (all through helper)
- [ ] `grep -n "src={card.imageUrlSmall}" src/components/shell/command-palette.tsx` → no matches
- [ ] `bun test src/components` → 0 fail; new helper tests exist and pass
- [ ] `bunx tsc -b` → exit 0
- [ ] Only in-scope files modified

## STOP conditions

- `HoloCardData` fields differ from what "Current state" assumes (e.g. no `imageUrlSmall` on the type used by the palette rows — palette may use a different search-hit type; if so, report the actual type; the helper's `Pick<>` may target that shared shape instead, but STOP first if it isn't structurally identical).
- Reusing `nonEmptyUrl` would create an import cycle.
- Verification fails twice on a step.

## Maintenance notes

- Any NEW thumbnail surface must use `cardThumbSrc` — reviewers should flag bare `imageUrlSmall` in review.
- Deferred deliberately: unifying HoloCard's internal image FSM with this helper (different concern, higher risk).

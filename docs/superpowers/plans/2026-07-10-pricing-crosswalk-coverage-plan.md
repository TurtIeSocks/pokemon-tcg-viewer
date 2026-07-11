# Pricing Crosswalk Coverage — Implementation Plan

Spec: `../specs/2026-07-10-pricing-crosswalk-coverage-design.md`. Execution: TDD, direct (cohesive
scripts-only change with shared types — one mind faster than fan-out). Verify hard at the end.

## Task 1 — extract shared `getProducts` cache helper

`scripts/tcgcsv-overlay.ts` has a private `getProducts(groupId, refresh, fetchImpl)` (disk cache +
polite delay) hardcoded to cat-85 (`PRODUCTS_URL`). Generalize to `getProducts(category, groupId,
refresh, fetchImpl)` in a new `scripts/tcgcsv-crosswalk.ts`, re-export/reuse from overlay so the JP
image-fill path is unchanged. Keep the cat-85 cache dir behavior identical.
- Test: cached read returns disk without fetch; miss fetches + writes cache. (Reuse overlay's
  existing test style; fake fetch.)

## Task 2 — `harvestTcgcsvTpIds` + `mergeTpIds` (TDD)

New in `scripts/tcgcsv-crosswalk.ts`:
- `harvestTcgcsvTpIds(cards, setToGroup, category, opts)` → `{ tpIdByCardId, report }`. Match by
  `setNumKey` (import from overlay, or move it here + re-export). Ambiguous setNumKey within a group
  → skip both, count in `report.ambiguousSkipped`.
- `mergeTpIds(base: PriceIdsMap, tpIdByCardId)` → fills `tp` slot only where null; never overwrites a
  non-null tp; cm untouched; returns `{ map, filled }`.
- Tests (`scripts/tcgcsv-crosswalk.test.ts`): match happy-path; number normalization; ambiguous
  skip; unmapped group ignored; merge precedence (TCGdex tp wins, null filled, cm preserved).

## Task 3 — wire harvest into `build-corpus.ts`

In the entrypoint, after `harvestPriceIds` + before `assertCrosswalkOk`:
- Load the region's setToGroup map (`tcgcsv-en-crosswalk.json` for en, `tcgcsv-crosswalk.json` for
  asia); if the file is absent, skip (empty map → no-op).
- `cards` for the harvest = `raw.map(c => ({id, setId: c.set.id, number: c.localId}))`.
- `harvestTcgcsvTpIds` → `mergeTpIds` → log the report + filled count. Guard the whole harvest in
  try/catch → on any failure keep the TCGdex-only crosswalk (keep-last-good).
- `assertCrosswalkOk` runs on the merged map.

## Task 4 — `build-prices.ts` cat-3 + cat-85 (TDD)

- Generalize `fetchTpPrices(fetchJsonFn)` → fetch both `tcgplayer/3` and `tcgplayer/85` group prices,
  concat records. Bump the doc-comment. `groupCount` becomes the sum.
- Test (`scripts/build-prices.test.ts`): injected fetch returns cat-3 + cat-85 groups/prices;
  records concatenated; a JP productId present only in cat-85 resolves in `joinPrices`.

## Task 5 — EN map generator + generated artifact

`scripts/build-tcgcsv-en-map.ts` (dev CLI, `import.meta.main`):
- Fetch tcgcsv cat-3 `/groups` + TCGdex EN `/sets`.
- Auto-match: exact normalized-name; fallback publishedOn ±14d of releaseDate + name-token overlap.
- Write `scripts/data/tcgcsv-en-crosswalk.json` (setId → groupId) + print matched/unmatched report.
- Run it once, eyeball the report, commit the JSON. (The generator's matcher gets one small unit test
  for the normalize + exact-match; the date-fallback is judgment, not unit-pinned.)

## Task 6 — verify + merge

- `bun test` (full), `bunx tsc -b`, `bunx biome check` — all green.
- A live smoke of `harvestTcgcsvTpIds` against real tcgcsv (one EN group + one JP dead-set group) to
  prove real ids come back and match real cardIds.
- Merge locally to main per finish-branch default; clean up worktree + branch.

## Out of scope (deferred, noted in report)

- Full JP map for the other ~345 cat-85 groups (cross-language name match — needs its own generator
  run + hand-verify). Dead-set map only this build.
- Lever 2 (upstream setlists to TCGdex) — owner/community task, off the code path.

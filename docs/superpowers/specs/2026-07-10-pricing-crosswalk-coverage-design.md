# Pricing Crosswalk Coverage — Design

**Date:** 2026-07-10
**Status:** Full-auto build (owner chose "Levers 1 + 3 together", "Full auto")
**Parent:** `2026-07-03-pricing-implementation-design.md` (the shipped pipeline); chip `task_e0d37199`
**Relates:** memory `project_pricing_pipeline`, `project_asian_catalog_phase2`, `reference_jp_data_sources`

## Problem

The price crosswalk (`cardId → [cardmarket idProduct, tcgplayer productId]`) is harvested
**solely** from TCGdex's per-card `pricing` block (`harvestPriceIds` / `priceIdsOf` in
`scripts/build-corpus.ts`, from official `api.tcgdex.net`). That block covers:

- **EN: 19168/23323 = 82%** (near-total; the missing 18% are cards TCGdex serves no `pricing` for).
- **JA: 1937/6246 = 31%**, and that 31% is **cardmarket-only** (~zero tcgplayer). `build-prices.ts`
  also fetches **only tcgcsv category 3 (EN)**, so even a JA tcgplayer id would resolve to nothing.
  JA today = cardmarket EUR only.

Every card absent from the crosswalk shows "no market data". This coverage is the ceiling on the
whole pricing pipeline (which is otherwise live — `PRICING_ENABLED=true`, worker serving, daily cron).

**The bottleneck is 100% the crosswalk, not the price feeds.** `build-prices.ts` already fetches
*every* cardmarket product + *every* tcgcsv cat-3 tcgplayer product daily. The prices are in hand;
only the `cardId → productId` mapping is missing. Raise the crosswalk → coverage rises for free.

## Insight (verified 2026-07-10 against live APIs)

- tcgcsv cat-3 (EN, 217 groups) and cat-85 (JP, 448 groups) product records carry a `Number`
  extendedData field ("074/086"), the SAME shape cat-85 already uses. The existing
  `setNumKey`/`productToCard` machinery in `scripts/tcgcsv-overlay.ts` matches a tcgcsv product to
  our card by `setId + normalized-number` — proven, with tie-rejection (`uniqueMatch`).
- `scripts/tcgcsv-overlay.ts` **already fetches cat-85 products** (cached to disk) during the asia
  corpus build and matches them to cardIds by set+number — but only to build an image URL; the
  `productId` is used ([tcgcsv-overlay.ts:73](../../../scripts/tcgcsv-overlay.ts)) then discarded.
- pokemontcg.io exposes only a redirect url (`prices.pokemontcg.io/tcgplayer/{id}`), **not a raw
  productId** — so the ptcg-overlay path cannot supply ids without 20k redirect-follows. Rejected.
- **Levers 1a and 3 are the same code** — "harvest `cardId → tcgplayer productId` from tcgcsv by
  exact set+number", differing only in category (85 vs 3) and the group↔set map. Build once.
- **Cadence:** a card's productId changes only when sets/cards change (weekly), not daily. So the
  harvest belongs in `build-corpus` (weekly), where the card list is already in memory — not in the
  daily `build-prices`. `build-prices` only needs a cat-85 `/prices` fetch added so JP ids resolve.

## Design

### 1. tcgcsv crosswalk harvest (new, weekly — rides `build-corpus`)

New module `scripts/tcgcsv-crosswalk.ts`, one pure-ish function:

```ts
harvestTcgcsvTpIds(
  cards: {id: string; setId: string; number: string}[],
  setToGroup: Record<string, number>,   // our setId → tcgcsv groupId
  category: 3 | 85,
  opts?: { getProducts?; onReport? },
): Promise<{ tpIdByCardId: Map<string, number>; report: HarvestReport }>
```

- For each mapped set, fetch that group's `/tcgplayer/{cat}/{groupId}/products` (reuse the disk-cache
  + freshness-marker pattern from `tcgcsv-overlay.ts`; extract a shared `getProducts` helper), index
  by `setNumKey(setId, number)` → productId, match to our cards.
- **Guardrails (lever-3 risk containment):**
  - Only mapped groups are touched — the map IS the primary guardrail. Unmapped groups skipped (no
    worse than today).
  - Exact set+number match only. If two products in a group share a `setNumKey`, skip both
    (ambiguous — never guess), like `uniqueMatch`.
  - Emit a `HarvestReport { setsHarvested, cardsMatched, ambiguousSkipped, groupsUnfetched }` and
    `console.log` it per region so a bad map is visible in CI logs.

### 2. Merge into the crosswalk (`build-corpus.ts`)

After `harvestPriceIds` (TCGdex, authoritative), call `harvestTcgcsvTpIds` and **fill only the `tp`
slot where TCGdex left it null** — never overwrite a TCGdex-provided tp id (trust the upstream's own
mapping first; tcgcsv fills gaps). Cardmarket ids are untouched (tcgcsv has none). One helper:

```ts
mergeTpIds(base: PriceIdsMap, tpIdByCardId: Map<string, number>): { map: PriceIdsMap; filled: number }
```

- EN run (`baseLang="en"`): cat 3 + `scripts/data/tcgcsv-en-crosswalk.json`.
- Asia run (`isAsia`): cat 85 + `scripts/data/tcgcsv-crosswalk.json` (the existing dead-set map;
  extendable later for full JP). The asia run already has cat-85 products cached, so this is nearly
  free for the dead sets.
- `assertCrosswalkOk` still runs on the merged (higher) coverage — the harvest only raises it.

### 3. build-prices: fetch cat-85 JP prices too

`scripts/build-prices.ts` currently fetches only `tcgcsv.com/tcgplayer/3/...`. Add cat-85:

- Generalize `fetchTpPrices` to take a category base; fetch cat 3 **and** cat 85, concatenate the
  records into one `tpById` index (productIds are globally unique across tcgplayer categories, so no
  collision). JP crosswalk tp ids now resolve to USD prices.
- Keep `MIN_PRICED_CARDS` keep-last-good floor; coverage only rises.

### 4. The EN group↔set map (`scripts/data/tcgcsv-en-crosswalk.json`)

The one new committed data artifact. Generated once by a dev tool `scripts/build-tcgcsv-en-map.ts`
(run manually, like `tcgcsv-overlay.ts`'s CLI), committed, hand-verifiable:

- Fetch tcgcsv cat-3 `/groups` (name, abbreviation, publishedOn) + TCGdex EN `/sets` (id, name,
  releaseDate).
- Auto-match: (1) exact normalized-name (strip "Pokémon"/punctuation/case); (2) fallback
  publishedOn within ±14 days of releaseDate AND normalized-name token overlap. Ambiguous / no match
  → left OUT and printed in an "unmatched" report for optional hand-fill.
- ponytail: auto-map the confident ones, report the residue, hand-fill only if a high-value set is
  missed. A set already 100%-covered by TCGdex that we skip costs nothing (no gaps to fill).

## Files

- **New:** `scripts/tcgcsv-crosswalk.ts` (`harvestTcgcsvTpIds`, `mergeTpIds`, shared `getProducts`),
  `scripts/tcgcsv-crosswalk.test.ts`, `scripts/build-tcgcsv-en-map.ts` (dev generator),
  `scripts/data/tcgcsv-en-crosswalk.json` (generated, committed).
- **Edit:** `scripts/build-corpus.ts` (call harvest + merge in the entrypoint),
  `scripts/build-prices.ts` (`fetchTpPrices` cat-3 + cat-85), `scripts/tcgcsv-overlay.ts` (extract
  the shared `getProducts`/cache helper so both callers reuse it — no logic change to image-fill).
- **Tests:** `scripts/build-prices.test.ts` (cat-85 merge), `scripts/build-corpus.test.ts` if a
  merge unit test fits.

## Error handling / keep-last-good

- tcgcsv unreachable during corpus build → harvest returns an empty map → crosswalk = TCGdex-only
  (today's behavior). Never blanks the good crosswalk. Same resilience pattern as the image overlay.
- A malformed / stale group→set map entry can only *fail to match* (skip) — it cannot inject a wrong
  price, because the match still requires an exact set+number hit within that specific group. Worst
  case of a mis-mapped group = a few cards get no match (unmapped-equivalent), surfaced in the report.
- cat-85 prices feed down → JP falls back to cardmarket-only (today's behavior).

## Testing (TDD)

- `harvestTcgcsvTpIds`: fixture products → correct `cardId → productId`; ambiguous setNumKey skipped;
  unmapped group ignored; number normalization ("074/086" ↔ "74" ↔ "074").
- `mergeTpIds`: fills null tp only, never overwrites a TCGdex tp, leaves cm untouched.
- `fetchTpPrices`: cat-3 + cat-85 records concatenated; injected fetch, no network.
- `joinPrices` (existing): a JP card with a tcgcsv-harvested tp id + a cat-85 price row → priced.
- All existing script tests stay green; full suite + tsc + biome per project gates.

## Assumptions (owner checkpoint — full-auto)

1. **Harvest cadence = weekly** (in build-corpus), not daily — productId is a corpus fact. build-prices
   gains only the cat-85 price fetch.
2. **TCGdex tp id wins over tcgcsv** when both exist (never overwrite); tcgcsv fills gaps only.
3. **EN group↔set map auto-generated + committed**, confident matches only; the residue is skipped
   (reported), not hand-mapped exhaustively — matches the "guarded, reject-ambiguous" mandate.
4. **JP scope this build = the existing dead-set map** (cat-85, ~103 sets) for the cheap first lift;
   a broader JP map (the other ~345 groups) is a follow-up, since it needs the same generator run for
   cat-85 and more hand-verification.
5. **No new licensing surface** — tcgcsv (cat 3 + 85) and cardmarket are already the shipped sources;
   this only harvests more ids from them. Attribution/link-back posture unchanged.
6. Values still **default visible**, prices never paywalled — unchanged.

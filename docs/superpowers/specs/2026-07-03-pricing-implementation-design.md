# Pricing Implementation — Design

**Date:** 2026-07-03
**Status:** Draft, pending owner approval
**Roadmap:** Phase 4 (Valuation & P&L, items 4.1–4.4) of `2026-06-04-collector-roadmap-kill-list-design.md`

## Goal

Turn the dark pricing subsystem (`PRICING_ENABLED = false`, stubbed `buildPriceLines()`, "coming soon" Pricing tab) into a full market-pricing layer: per-card prices with source + timestamp labels, portfolio market value with cost-basis P&L, price history charts, and a hide-value toggle. Local-first, no Supabase dependency, licensing-conscious.

Philosophy guardrail (from the roadmap): this is a collector ledger, not a speculation dashboard. Values are optional, clearly labeled, and hideable in one click.

## Research findings (verified 2026-07-03)

### Sources

| Source | Bulk access | Coverage | Licensing | Role |
|---|---|---|---|---|
| TCGdex (our corpus base) | Pricing only on per-card endpoint; our weekly mirror crawl already fetches it (CI sets `TCGCSV_USER_AGENT`, so tcgplayer prices flow) | cardmarket EUR (EN + ~1.2k ja cards) + tcgplayer USD per finish (EN); **includes marketplace product ids** (`cm.idProduct`, `tp.<finish>.productId`) | MIT code; republished prices carry no license from TCGdex | **Crosswalk harvester** (weekly) |
| Cardmarket public price guide | Free daily JSON, no credentials: `downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json`, keyed by `idProduct` | All CM Pokémon products, EUR (avg/low/trend/avg1/avg7/avg30) | Official public download; GTC §9 (2022 archived text) requires written agreement for *presentation* of prices — yellow | **Daily EUR source** |
| tcgcsv.com | Free daily JSON per group: `/tcgplayer/3/{groupId}/prices` (Pokemon EN = category 3; Pokemon Japan = category 85). Daily refresh ~20:00 UTC. Public price-history archive since 2024-02-08 | tcgplayer USD, per `subTypeName` (Normal / Holofoil / Reverse Holofoil; 1st Edition on vintage), `marketPrice`/`lowPrice`/etc | tcgcsv grants nothing (no license published); TCGplayer API is closed to new signups; multi-year community precedent (MTGJSON, TCGdex, pokemontcg.io) with zero observed takedowns — yellow | **Daily USD source** |
| PriceCharting | $49/mo Legendary tier: API (1 req/s) + daily CSV dump. Prices integer pennies. No historic data via API | Printing-level products (`[1st Edition]`, `[Shadowless]`, `[Reverse Holo]` are separate products) + graded tiers (Grade 7 → BGS-10/PSA-10/CGC-10/SGC-10 columns) | **RED:** ToS "Price Data cannot be used in any software, application, or system accessible to third parties … without express written permission" | **Deferred** — connector port only, pursue written license |

### Competitor UX patterns

- Per-card current price is free in every competitor; paywall levers are history depth (Collectr, PokeDATA), portfolio deltas (pkmn.gg Pro), graded support.
- Source + freshness labeling is weak everywhere ("same-day", "daily", or silence). Roadmap 4.3 wants explicit per-price source + timestamp labels — cheap differentiator.
- Only Dex names multiple sources per card; only PokeDATA/Collectr do cost-basis P&L.

## Approaches considered

- **A. Live-only.** Stop dropping TCGdex `pricing` in `mapTcgdexFocusCard`; detail view shows live prices. No portfolio rollup (would need one fetch per owned card), no history, no offline. Too thin.
- **B. Daily price blob from direct sources (CHOSEN).** Weekly corpus crawl harvests marketplace ids; daily Action joins cardmarket guide + tcgcsv into one R2 blob; client caches it like the corpus. Portfolio math offline, history accrues server-side, ~250 cheap GETs/day, no extra Docker.
- **C. PriceCharting-first** (roadmap 4.4's original shape). Dead as primary: licensing RED without a written deal, $49/mo, no history via API. Survives as a future connector behind the `PriceSource` port.

## Architecture

### 1. Crosswalk harvest (weekly, rides the existing corpus build)

`scripts/build-corpus.ts` already crawls full per-card records from the local TCGdex mirror. `trimCard()` stays price-free. The build additionally emits **`corpus/price-ids.json.gz`** to R2:

```jsonc
{ "base1-4": [273699, 42382] }   // cardId → [cardmarket idProduct | null, tcgplayer productId | null]
```

- Server-side artifact for the price builder only. Never shipped to clients.
- One tcgplayer `productId` per card (verified: `normal` and `reverse-holofoil` share the same productId — the finish lives in tcgcsv's `subTypeName`). Finish codes are assigned at the daily join: `N` Normal, `H` Holofoil, `R` Reverse Holofoil, `1H`/`1N` 1st Edition Holofoil/Normal; unknown subtype names are logged and skipped.
- Covers both regions (west + asia crawls each emit their own file; card ids are globally unique; the daily builder merges them).

### 2. Daily price build (`scripts/build-prices.ts` + new Action)

New workflow `build-prices.yml`, cron ~21:30 UTC (after tcgcsv's 20:00 refresh). Steps:

1. Fetch `price-ids.json.gz` from R2.
2. Fetch cardmarket `price_guide_6.json` (1 GET).
3. Fetch tcgcsv `/tcgplayer/3/{groupId}/prices` for every Pokemon EN group (~250 GETs, retry + backoff like the corpus crawl).
4. Fetch the full ECB reference FX table (~31 currencies; frankfurter.dev, free/public, daily).
5. Join by product id → emit **`corpus/prices/latest.json.gz`**:

```jsonc
{
  "v": 1,
  "date": "2026-07-03",
  "fx": { "base": "EUR", "date": "2026-07-03",
          "rates": { "USD": 1.09, "GBP": 0.85, "JPY": 170.2 /* …~31 ECB currencies */ } },
  "sources": { "tp": "2026-07-03", "cm": "2026-07-03" },
  "cards": {
    "base1-4": {
      "tp": { "H": [72034, 53499] },        // [marketPrice, lowPrice] cents USD, per finish
      "cm": [50168, 27674, 40096, 56391]    // [trend, avg1, avg7, avg30] cents EUR
    }
  }
}
```

- All money integer cents (matches `Stack.pricePaid` convention; `0` is a real price, missing = key absent).
- Size estimate: ~26k priced cards → ~400 KB gz (same order as the 490 KB corpus). Measure at build; if it balloons, move to columnar arrays (not expected).
- **Keep-last-good:** any upstream failure → previous blob stays live (ptcg-overlay resilience pattern); blob `date` tells clients how stale.
- Also each day: copy to `corpus/prices/archive/YYYY-MM-DD.json.gz` and append today's point to per-set history rollups (§6).

### 3. Serving (worker)

Clone the `/corpus` pattern (R2 + ETag + conditional GET + edge cache 1h + SWR):

- `GET /corpus-prices` → `corpus/prices/latest.json.gz`
- `GET /corpus-prices/version` → `{ date, etag }` cheap poll
- `GET /corpus-prices/history/{setId}` → per-set rollup blob (§6)

### 4. Client runtime

`src/store/corpus/prices-runtime.ts` + `prices-store.ts`, mirroring the i18n lane:

- One fetch of `/corpus-prices` on demand (first price surface mounted), gunzip, IDB cache (`ptcg-corpus` DB, own store), ETag revalidate on boot.
- Non-persisted Zustand map `cardId → PriceRecord` + blob meta (date, fx, sources).
- Selectors join corpus + userland; **invoke `zustand-subscription-patterns` skill before writing any of this code** (hard trigger).

### 5. Valuation engine (`src/store/userland/valuation.ts`, pure functions + selectors)

- **Finish resolution:** `Stack.printing.type/subtype` → finish code; fallback chain: exact finish → `H` → `N` → cardmarket trend × FX.
- **Currency (multi-currency v1):**
  - New profile setting `displayCurrency` (ISO 4217; default auto-detected from browser locale, overridable). Every rollup and P&L renders in it. Supported set = the ECB reference table (~31 currencies).
  - Per-card price lines stay **native per source** (tcgplayer USD, cardmarket EUR) with a "≈ converted" secondary value when native ≠ display currency. Any converted number is "≈"-labeled with rate + date in a tooltip.
  - `Stack.currency` picker unlocks in the stack edit form (the reserved slot becomes editable; options = supported set). `pricePaid` is recorded in the true purchase currency; P&L converts both sides to the display currency **at today's rates** (documented simplification — no historical-rate forex accounting).
  - `money.ts` gains an ISO 4217 minor-unit exponent map (JPY = 0, default 2, plus the handful of exceptions). Storage stays integer minor units; formatting goes through `Intl.NumberFormat` with the currency code.
- **Condition:** per-card surfaces always show the NM market price. Portfolio estimates apply a documented constant multiplier table — NM 1.0, LP 0.85, MP 0.70, HP 0.55, DMG 0.40 — labeled "condition-adjusted estimate". Exported constant, one place.
- **Grading:** no licensed graded source in v1. Graded stacks valued at raw NM price with a "raw price" badge. PriceCharting connector (post-license) upgrades this.
- **Stats:** `useCollectionStats` gains `marketValue: number | null` and `unrealizedPnL: number | null` (market − cost basis) alongside the existing cost-basis `estValue`. Canonical internal currency is **USD cents** (stats, history points, snapshots); conversion to `displayCurrency` happens at render, so changing the setting never rewrites stored data.
- `buildPriceLines(card)` becomes real: reads the prices store, returns per-source lines with finish label, formatted price, updated date, deep link.

### 6. History

- **Per-set rollup blobs** `corpus/prices/history/{setId}.json.gz`: `cardId → [[epochDay, marketCentsUSD], …]`, appended daily by the price build; downsampled — daily points for the last 90 days, weekly beyond. ~200 set blobs, each small. Card Pricing tab lazy-fetches its set's blob on open.
- **Day-1 trend without accrual:** cardmarket `avg1/avg7/avg30` from the live blob renders trend chips immediately.
- **Portfolio value-over-time (local-first):** when the app loads a blob with a new `date`, compute portfolio totals and write `{ date, totalCents, bySetCents }` (USD canonical) through the repo port into IDB (new `snapshots` store; `updatedAt` + `deletedAt` tombstone, sync-ready like every userland entity). Vault chart reads local snapshots. **This removes roadmap 4.2's Supabase dependency.** Sync arrives later via the same repo port as everything else.

### 7. UI surfaces

- **Card Pricing tab** (scaffold exists in `card-pricing-tab.tsx` / `card-prices.tsx`): per-source price lines (finish-labeled), trend chips (1d/7d/30d from cardmarket), history chart (ranges 30d/3m/6m/1y as data allows), per-line source + timestamp, deep links (`tcgplayer.com/product/{productId}`, cardmarket product page), and the mandated notice: "TCGplayer data — not endorsed or certified by TCGplayer."
- **Stack rows / CardCollectionManager:** per-stack market value + P&L delta vs `pricePaid`.
- **Vault hero + profile stats:** Market value, Cost basis, P&L (green/red), value-over-time chart (from local snapshots).
- **Binder view:** binder market value.
- **Hide-value toggle:** profile setting (alongside `displayLanguage`) + quick toggle on the vault hero. Hides every money surface, including the existing cost-basis `estValue`. Default: visible.
- **Display currency select** on the profile (next to the hide toggle); **currency picker** in the stack edit form (defaults to the profile's display currency for new stacks).
- **Grid tiles:** no price badges (speculation-averse default; revisit only on demand).
- `PRICING_ENABLED` flips to `true` and remains as a kill switch.

### 8. Licensing posture

- Prices are **never** behind any future paid tier — weakens the "commercial redistribution" reading of upstream terms and matches the "No landlord" brand.
- Attribution + deep link on every price surface; per-source timestamps.
- Business steps (non-blocking, owner-level): email Cardmarket for written presentation OK (GTC §9); approach PriceCharting for a written app-display license.
- `PriceSource` port in the price-build script (source adapters emit a common shape) so a licensed PriceCharting connector — or a future eBay/graded source — slots in without rework.

## Error handling

- Card missing from blob → selectors return null → surface renders nothing ("No market data" in the Pricing tab).
- Price build upstream failure → keep-last-good blob; client shows "updated N days ago" when `date` lags.
- ja cards: `tp` absent → cardmarket-only lines; rollup uses CM × FX.
- FX fetch failure at build → previous table carried forward (labeled by date); if a rate for the chosen display currency is missing entirely, affected surfaces fall back to native-currency display and the rollup shows per-currency subtotals rather than guessing.
- History blob 404 (new set) → chart section hidden, trend chips still render.

## Testing

- Pure functions unit-tested: product-id join, finish fallback chain, FX conversion (incl. 0-decimal currencies like JPY), minor-unit exponent formatting, condition multipliers, history downsampler, snapshot computation.
- `build-prices.ts` tested against fixture JSONs (cardmarket guide sample, tcgcsv group sample, crosswalk sample) — no network in tests.
- Runtime tests with fake fetch + `fake-indexeddb`; components rendering card grids pre-seed `useCorpusRuntime` per project test rules.
- UI: hide-toggle hides all money surfaces; price lines render source/timestamp/link; P&L sign/color.
- Full suite + tsc + biome green per phase (project verification rules).

## Phasing (4 PRs, each its own plan)

1. **Pipeline** — crosswalk harvest in build-corpus, `build-prices.ts`, daily Action, worker routes, blob fixtures + tests.
2. **Card surfaces** — prices-runtime, real `buildPriceLines`, Pricing tab live (lines, trends, attribution), flag flip.
3. **Valuation** — valuation.ts, stats market value + P&L, stack rows, binder value, hide-value toggle, multi-currency (displayCurrency setting, money.ts exponents, stack currency picker, FX conversion).
4. **History** — dated archives, per-set rollups, history charts, local portfolio snapshots + vault chart.

Parked (post-v1): PriceCharting connector (needs written license), tcgcsv category-85 JP crosswalk (USD prices for ja cards), eBay/graded sources, price alerts, per-card condition price picker, historical-rate (purchase-date) FX for P&L.

## Assumptions (owner checkpoint — delegate mode)

1. **Risk acceptance:** shipping tcgplayer-via-tcgcsv + cardmarket-via-public-guide under yellow licensing, mitigated by attribution, link-backs, and never paywalling prices. Community precedent (MTGJSON, TCGdex, pokemontcg.io, tcgcsv's own public archive) shows tolerance; contract-claim risk is not zero.
2. **PriceCharting deferred** — roadmap 4.4 becomes "port + pursue written permission", not a v1 connector. Graded/sealed pricing waits for the deal.
3. **Multi-currency v1:** user-selectable `displayCurrency` (default from browser locale), supported set = ECB reference table (~31 currencies); source prices stay native with "≈" conversions; `Stack.currency` picker unlocked. P&L converts at **today's** rates, not purchase-date rates (documented simplification).
4. **Condition multipliers** apply to portfolio estimates only, from one constant table; per-card display is always NM market. No per-card condition price picker in v1.
5. **History** is R2 rollups + local IDB snapshots — no Supabase dependency (changes roadmap 4.2's stated dep).
6. **ja coverage v1** = cardmarket-only (~1.2k TCGdex-mapped ja cards); tcgcsv cat-85 crosswalk is a later stretch.
7. Values **default visible** with a global hide toggle (not hidden-by-default).
8. **Single global price blob** covering both regions (card ids globally unique); asia-only users pay ~400 KB once, cached.
9. Daily price cadence (matching upstream refresh) is fresh enough; no intraday updates.

# Printing capture for pricing accuracy — design

Date: 2026-07-10 · Status: approved (delegate mode) · Branch: `c/infallible-mccarthy-1fb893`

## Problem

`valuation.ts` values a stack whose `printing` is null by guessing a finish via the shared
`MARKET_FINISH_ORDER` fallback (`["N","H","1N","1H"]`, Normal-first). Every quick-add / scan /
CSV / legacy stack has `printing: null`, so a holofoil or reverse-holo the collector actually
owns is valued at the cheaper Normal price. Reverse Holofoil (`"R"`) isn't in the fallback at
all, so a reverse-only card (e.g. WotC movie promos Scizor 33 / Entei 34 / Pichu 35) skips
tcgplayer pricing entirely.

The multi-printing case is inherently ambiguous — only the collector knows which printing they
own. The fix is **capture, not inference**. Inference from rarity/set metadata is explicitly
out of scope (it re-introduces the over-valuation the Normal-first fallback exists to prevent).

## Discovered bug (fixed by change 1)

`formToPatch` (`src/components/collection/stack-form-mapping.ts`) returns
`printing: chosen ?? null`, where `chosen` is looked up in `variantsDetailed`. Edit mode never
receives `variantsDetailed` (`StackManager` forwards it only to the create-mode form), so
`chosen` is always `undefined` in edit mode and **every edit-form save silently wipes an
existing printing to null**. This is live data loss today.

## Changes

### 1. Edit-mode printing picker (the fix)

Thread `variantsDetailed` from `StackManager` → `StackRow` → edit-mode `StackEditForm`.
The picker UI, i18n string (`m.stack_field_printing()`), and `itemToForm` variantId prefill
already exist — this is prop plumbing.

**Preserve semantics** (`stack-form-mapping.ts`), required because CSV-synthesized printings
(change 2) carry an empty `variantId` the picker cannot represent:

- `itemToForm` gains a `variantsDetailed` param. Initial `variantId` =
  1. `printing.variantId` when it matches a detailed entry, else
  2. **finish-match upgrade**: the first detailed entry whose `finishForPrinting()` equals the
     stored printing's `finishForPrinting()` (upgrades a synthesized printing to the exact
     TCGdex one on next save), else
  3. `""`.
- `formToPatch` gains the existing stack's printing + the initial variantId. Printing in the
  patch =
  - matched `chosen` → `chosen`;
  - `variantId === ""` and initial was `""` → **preserve existing printing** (a form save that
    never touched the picker, or a picker that couldn't represent the printing, must not wipe
    it);
  - `variantId === ""` and initial was non-empty → user actively cleared → `null`.
- Create mode: existing printing is `undefined` → preserve resolves to `null` (unchanged
  behavior).

### 2. CSV variant column → printing

The column-mapper already aliases `variant: ["variant","printing","foil","finish","edition"]`
but drops the value into the coarse `variant` display string only. Add a pure
`printingFromVariantText(text: string): CardVariant | null` in `src/lib/card-variants.ts`
(co-located with `variantLabel`) that recognizes finish tokens case-insensitively:

- reverse (e.g. "Reverse Holofoil", "reverse holo") → `type: "reverse"`
- 1st edition + holo → `type: "holo"`, `stamp: ["1st-edition"]`
- 1st edition (alone) → `type: "normal"`, `stamp: ["1st-edition"]`
- holo/holofoil/foil → `type: "holo"`
- normal/regular/non-holo/unlimited → `type: "normal"`
- anything else → `null`

Matching precedence is load-bearing ("Reverse Holofoil" contains both "holo" and "foil";
"non-holo" contains "holo"): test **reverse first**, then the normal-family negations
("non-holo", "non holo"), then 1st-edition stamps, then holo/foil, then normal tokens.

Synthesized variants use `variantId: ""` (not a price key per `card-variants.ts` doc),
`subtype: null`, `size: null`. `rowToNewStack` (`src/store/userland/csv.ts`) sets
`printing: printingFromVariantText(row.variant)`; the raw source text stays in `variant` for
display. Resolved finishes then flow through `finishForPrinting` → exact price.

### 3. `"R"` appended to the finish fallback

`MARKET_FINISH_ORDER` becomes `["N","H","1N","1H","R"]` (`src/lib/corpus/price-types.ts`).
Appended **last**, never inserted: only reached when no other finish has a price, so it fixes
reverse-only cards without inflating any card that has a Normal/Holo entry. Both consumers
(portfolio valuation + sparkline) pick it up in lockstep via the shared constant. Update the
doc comments that enumerate the order.

### 4. Scanner — no change (documented decision)

On-device OCR reads name + number only; there is no finish signal (`AI_SCAN_ENABLED = false`).
Auto-setting printing for single-printing cards is valueless post-change-3 (the fallback
already resolves every single-print card). A finish chip in the scan tray would tax the
fast-add flow for a guess. Scanned stacks get their printing set later via the change-1 edit
picker.

## Tests

- `valuation.test.ts`: reverse-only card (only `tp.R` priced, `printing: null`) resolves via
  `"R"` instead of returning null.
- `card-variants.test.ts`: `printingFromVariantText` token table (holo, reverse holofoil,
  1st edition holofoil, 1st edition, normal, unlimited, junk → null, "" → null).
- `csv.test.ts`: row with `foil: "Reverse Holofoil"` yields `printing.type === "reverse"` and
  keeps `variant` raw text; unrecognized variant text yields `printing: null`.
- `stack-form-mapping` tests: finish-match upgrade; preserve-on-untouched; active-clear →
  null; regression for the edit-mode wipe bug.
- Component test: edit-mode `StackEditForm` renders the printing segmented control when
  `variantsDetailed` is passed through `StackRow`.

## Out of scope

- Rarity/set-metadata printing inference.
- Scanner finish capture.
- Any schema migration (`Stack.printing` exists; null today).
- CSV export of structured printing (export keeps the human-readable `variant` column).

## Assumptions (approved 2026-07-10)

1. Scanner gets no finish capture.
2. No rarity/set inference; `"R"` fallback is the only automatic improvement.
3. CSV synthesizes minimal `CardVariant`s with empty `variantId`.
4. `"R"` appended last, preserving the anti-over-valuation Normal-first order.
5. Scope = changes 1–3 + documented non-change 4.

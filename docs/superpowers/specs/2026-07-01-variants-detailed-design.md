# variants_detailed — precise printing capture

**Date:** 2026-07-01
**Branch:** `feat/variants-detailed` (off `feat/multilingual-catalog`)
**Status:** design approved, spec under review

## Problem

A single card id (e.g. Base Set Charizard, `base1-4`) covers several distinct
*physical printings* that a collector treats as different assets: 1st-Edition
Shadowless Holo, Shadowless Holo, Unlimited Holo, 1999–2000-copyright Holo. Their
real-world values differ by orders of magnitude.

Today the app only records a **coarse** variant on a stack — `Stack.variant`, a
free-text/boolean string ("holo", "firstEdition") flattened from TCGdex's boolean
`variants` object. It cannot express "1st Edition Shadowless", so the Vault can't
say which printing you actually own.

TCGdex exposes the richer data in `card.variants_detailed`:

```json
[
  { "type": "holo", "subtype": "unlimited",             "size": "standard", "variantId": "4ffrmhcfiaejakhepqdkx7o" },
  { "type": "holo", "subtype": "shadowless",            "size": "standard", "stamp": ["1st-edition"], "variantId": "mtltux8qtgdu4exu903oasum21juxbvx6lx" },
  { "type": "holo", "subtype": "shadowless",            "size": "standard", "variantId": "3takscxpcqoqcfnxk1ivs2y6" },
  { "type": "holo", "subtype": "1999-2000-copyright",   "size": "standard", "variantId": "zqq5g2u9n0st0gren5bssktmac2ywqaw" }
]
```

## Findings that shaped this design

Verified against the live TCGdex API (2026-07-01):

1. **Broad coverage.** Every real card id from Base → Scarlet & Violet returns a
   non-empty `variants_detailed` (1–4 entries; fine `subtype`/`stamp` distinctions
   concentrate in vintage WOTC sets, modern cards are usually a single printing).
2. **No per-variant image.** Traversing the whole payload, the only `image` key is
   the top-level card scan; `variants_detailed` entries carry none, and every
   candidate per-variant image URL 404s. A variant is **text metadata only** — the
   card art is one shared scan.
3. **Pricing does NOT key on `variantId`.** `card.pricing` is keyed by *source*
   (`cardmarket`, `tcgplayer`) and *coarse type* (`tcgplayer.holofoil`,
   `cardmarket.avg` + `-holo` split) — no reference to any `variantId`. So all four
   Charizard holos share one `holofoil` price. **TCGdex cannot price by fine
   printing.** This feature therefore does **not** feed TCGdex pricing; its value is
   *recording* the exact printing so a future printing-aware source (e.g.
   PriceCharting, which prices by printing + grade) can attach.

**Consequence:** the stack must persist the printing as a **portable, semantic
identity** (`type` / `subtype` / `stamp`), not TCGdex's opaque `variantId`, because
a future price source matches on the meaning, not on TCGdex's internal key. The
`variantId` is kept only as a non-authoritative back-reference/disambiguator.

## Scope

**In:**
- Ingest `variants_detailed` on the **live card detail** (`FocusCardData`), not the
  corpus (see Non-goals for why).
- A shared `CardVariant` type + a `variantLabel()` formatter.
- A new `Stack.printing` structured field capturing the exact printing.
- A printing **picker** in the stack edit form (a select of the card's real
  printings) that appears only when `variants_detailed` exists; today's coarse
  free-text input is the fallback.
- A compact **"Printings"** line on the card detail (Details tab).
- A nullable `Stack.printing` field, backfilled idempotently (no version bump).

**Non-goals (deferred / explicitly out):**
- **Pricing.** Separate phase; TCGdex can't price per printing anyway.
- **Corpus schema change.** The picker lives only in the detail/manage view, which
  already fetches live per-card detail. Baking ~1.5 variants × ~20k cards (long
  `variantId`s) into the static gzip corpus would roughly double its size for data
  the grid never reads. Rejected on size.
- **Grid holo.** Still derived from the coarse corpus `variants[]` (one holo state
  per card — per-printing granularity is meaningless in the grid).
- **Per-variant images.** None exist.

## Data model

### Shared type + formatter — `src/lib/card-variants.ts` (new)

```ts
/** One physical printing of a card, mirrored from TCGdex variants_detailed. */
export interface CardVariant {
  variantId: string;          // TCGdex-internal id; back-reference only, NOT a price key
  type: string;               // "normal" | "holo" | "reverse" | ...
  subtype: string | null;     // "unlimited" | "shadowless" | "1999-2000-copyright" | ...
  size: string | null;        // "standard" | "jumbo" | ...
  stamp: string[] | null;     // e.g. ["1st-edition"]
}

/** The portable printing identity stored on a stack (no opaque back-ref needed to price). */
export type CardPrinting = CardVariant; // same shape; variantId retained as a convenience back-ref

/** Human label: stamp · subtype · type (+ size when not standard). */
export function variantLabel(v: CardVariant): string; // "1st Edition · Shadowless · Holo"
```

`variantLabel` humanizes tokens (`"1st-edition"` → `"1st Edition"`, `"shadowless"` →
`"Shadowless"`, `"1999-2000-copyright"` → `"1999-2000 Copyright"`), joins the present
parts with `" · "` in order **stamp → subtype → type**, and appends the `size` only
when it is not `"standard"` (e.g. `"Jumbo"`). Pure + independently testable.

### Detail mapper — `src/server/card-mappers.ts`

- `TcgdexFocusCard` gains `variants_detailed?: RawVariant[]`.
- `FocusCardData` gains `variantsDetailed?: CardVariant[]`.
- `mapTcgdexFocusCard` maps each entry, null-filling absent optional fields
  (`subtype`/`size`/`stamp` → `null`) per the project's "null, never undefined" rule.

### Userland — `src/store/userland/types.ts`

- `Stack` gains **one** new field: `printing: CardPrinting | null` — the structured
  identity, set only when the user picked from `variants_detailed`; `null` for legacy
  stacks, coarse picks, or cards without `variants_detailed`.
- `Stack.variant: string | null` is **unchanged in role**: the human **display
  label**. For a structured pick it is set to `variantLabel(printing)` (a snapshot,
  so the Vault renders with zero lookups); for the coarse/legacy path it stays the
  free-text/boolean string exactly as today.
- `printing` added to `EditableStackFields`.
- `normalizeStack` null-fills `printing`; stays idempotent (never migrates).

### Migration

Adding `printing` is a **nullable, idempotent** addition — the same pattern every
other optional Stack field already uses. No non-idempotent transform is involved, so
this needs **no `CURRENT_DATA_VERSION` bump** and **no `migrateUserlandData`
change** (that marker, currently `5`, is reserved for transforms `normalizeStack`
cannot do idempotently, e.g. the dollars→cents rescale). Concretely:

- `fillStack` (new-stack defaults, `idb-repo.ts`): `printing: input.printing ?? null`.
- `normalizeStack` (backfill on every read, `idb-repo.ts`): `printing: raw.printing ?? null`.
  Stays idempotent (only fills absent, never transforms present).
- Snapshot import: `backup.ts upgrade()` already runs imported stacks through the
  normalize path, so v1–v6 snapshots backfill `printing: null` for free. Bump the
  exported snapshot version / `SUPPORTED_VERSIONS` only if we want fresh exports
  explicitly tagged — optional, not required for correctness.

## UI

### Stack edit form — `stack-edit-form.tsx` + `stack-form-schema.ts` + `stack-form-mapping.ts`

The form already receives the card context. `CardCollectionManager` (in the card
detail/manage view) has the live `FocusCardData`, so it passes
`card.variantsDetailed` down to the form.

- **When `variantsDetailed` is non-empty:** render a **Select** of printings — one
  option per `CardVariant`, labelled `variantLabel(v)`, valued by `variantId` (a
  stable per-option key). On submit, resolve the chosen `variantId` back to its
  `CardVariant` and set `printing = { … }` **and** `variant = variantLabel(v)`.
  Include an explicit "Unspecified" option → `printing: null`, `variant: null`.
- **When absent (or no card context):** the current coarse `variant` text input,
  unchanged. `printing` stays `null`.

Schema: `printing` is optional; the mapping layer (dollars↔cents style boundary)
resolves the selected id → structured object before persisting, and reads back the
current stack's `printing.variantId` (if any) to preselect the option.

### Stack label — `stack-label.ts`

Unchanged: it reads `Stack.variant`, which now already holds the precise label for
structured picks. (No dependence on `printing` at render time — the label is a
stored snapshot.)

### Card detail "Printings" line — `card-info.tsx`

When `card.variantsDetailed?.length`, render a compact meta line in the Details tab
listing the labels (e.g. `Printings  Unlimited Holo · Shadowless Holo · 1st Edition
Shadowless Holo · 1999-2000 Copyright Holo`). Informational; sits alongside the
existing subtype/type/evolves-from strip.

## Data flow

```
TCGdex /cards/{id}.variants_detailed
  → mapTcgdexFocusCard → FocusCardData.variantsDetailed: CardVariant[]
     → CardCollectionManager (has FocusCardData)
        → StackEditForm printing <Select>   (variantLabel per option)
           → on submit: variantId → CardVariant
              → Stack.printing = CardVariant ; Stack.variant = variantLabel
                 → repo persist → Vault renders Stack.variant
        → CardInfo "Printings" line (variantLabel list)
```

The corpus, grid, holo styling, and pricing are untouched.

## Error handling / edge cases

- **No `variants_detailed`** (or detail still loading): fall back to the coarse
  free-text `variant` input; `printing` null. No error surface.
- **Legacy stacks** (`variant` set, `printing` null): render exactly as today; the
  picker preselects "Unspecified" (no matching structured option) but leaves the
  existing `variant` string intact unless the user changes it.
- **Duplicate structured identities** in one card's list (same type/subtype/size/
  stamp): disambiguated by `variantId` at the option level (the select is keyed by
  id), so both remain selectable even if their labels collide.
- **`variantId` instability across TCGdex rebuilds:** acceptable — it is a
  back-reference only; the authoritative stored identity is the semantic
  `type/subtype/stamp`.

## Testing

- `variantLabel`: token humanization, ordering (stamp · subtype · type), size
  handling, all-null → coarse `type` only.
- `mapTcgdexFocusCard`: `variants_detailed` → `variantsDetailed` with null-filled
  optionals; absent → `undefined`.
- `normalizeStack` + `fillStack`: `printing` null-fills on read + new-stack; stays
  idempotent. A v6 snapshot lacking `printing` imports with `printing: null`,
  `variant` intact.
- Stack form mapping: select a printing → resulting `NewStack`/`StackPatch` carries
  `printing` + `variant` label; "Unspecified" → both null; legacy stack preselects
  correctly.
- `CardInfo`: renders the Printings line only when `variantsDetailed` is present.

## Files touched

- `src/lib/card-variants.ts` (new) + test
- `src/server/card-mappers.ts` (+ test)
- `src/store/userland/types.ts` (add `Stack.printing`)
- `src/store/userland/idb-repo.ts` (`fillStack` + `normalizeStack` null-fill) + test
  (`backup.ts` only if we choose to tag a new export version — optional)
- `src/components/collection/stack-edit-form.tsx`, `stack-form-schema.ts`,
  `stack-form-mapping.ts` (+ tests)
- `src/components/card/card-info.tsx` (Printings line) + test
- `src/components/card/card-cockpit.tsx` / `CardCollectionManager` wiring (pass
  `variantsDetailed` to the form)

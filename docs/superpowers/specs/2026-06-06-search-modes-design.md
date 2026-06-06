# Search modes — Exact / Contains / Fuzzy

**Date:** 2026-06-06
**Status:** Approved (design)
**Branch (planned):** `feat/search-modes`

## Problem

The card search exposes a single boolean toggle ("Exact" vs fuzzy). Two issues:

1. **The label lies.** Today's "Exact" still returns substring matches — searching "char" in
   Exact mode returns "Charizard". That is partial matching, not exact matching.
2. **The UI is a two-state pill** sitting beside the input. It cannot represent more than two
   states, and it reads as a disconnected control rather than part of the search field.

We want three honest modes and a control that fuses into the input.

## Modes

| Mode | Matches | Underlying tiers | Notes |
|----------|----------------------------------|------------------|-------|
| **Exact** | Whole name equals the query | tier 0 | After normalization (see below). |
| **Contains** | Name includes the query as a prefix or substring | tiers 0–2 | This is today's "Exact" behavior. |
| **Fuzzy** | Contains, plus typo-tolerant near-misses | tiers 0–3 | This is today's default behavior. |

**Default: Fuzzy.** It is the most forgiving, and the relevance sort already orders matches
exact → prefix → substring → fuzzy, so exact hits float to the top even in Fuzzy mode.

### "Exact" is normalized-exact

The matcher's `normalize()` lowercases, strips diacritics, and removes all non-alphanumerics
(including spaces). "Exact" mode means `normalize(name) === normalize(query)` — so it is
case-, space-, and punctuation-insensitive. A query of `mr. mime` matches the card "Mr Mime".

This is intentional. Byte-exact matching (case- and punctuation-sensitive) would be surprising and
near-useless for a card catalog. Exact means "the whole name, not a fragment" — not "every
character including casing".

### Tier system (already exists)

`matchName` in `src/store/corpus/fuzzy.ts` already returns a `MatchTier`:

- tier 0 = exact (`name === q`)
- tier 1 = prefix (`name.startsWith(q)`)
- tier 2 = substring (`name.includes(q)`)
- tier 3 = fuzzy (Damerau-Levenshtein within budget)

The three modes are just cutoffs over these tiers. The matcher change is small.

## Data model

Replace the boolean `exact` with a string enum across every layer it flows through.

```ts
// src/store/corpus/fuzzy.ts — lowest layer, zero dependencies, so the type lives here
export type SearchMode = "exact" | "contains" | "fuzzy";
```

`matchName(q, name, tokens, mode: SearchMode = "fuzzy")`:

- `exact`   → return the tier-0 match only (`name === q`), else `null`.
- `contains` → return tiers 0–2 (current behavior when `exact` was `true`).
- `fuzzy`   → return tiers 0–3 (current behavior when `exact` was `false`).

The empty-query guard (`if (!q) return …`) and the multi-word token pass (fuzzy only) are
unchanged. Exact mode consults the whole normalized name only — never individual word tokens.

### No migration

This app has **zero users**. There is no stored data to migrate and no shareable links in the
wild. This is a clean break:

- IndexedDB binder rules (`SerializedQuery`) change field `exact: boolean` → `mode: SearchMode`.
  No reader for the legacy `exact` key.
- The URL search param is renamed `exact` → `mode`. No back-compat parse for `?exact=true`.

## UI

A shadcn `ButtonGroup` that fuses the input, the mode picker, and a decorative search icon into one
bordered control (reference: shadcn button-group with input). Layout:

```
[ input ............................ ][ ▼ <mode> ][ 🔍 ]
```

```tsx
<ButtonGroup>                                   {/* glass-themed, w-full */}
  <Input type="search" … />                     {/* flex-1, live onChange — unchanged */}

  <DropdownMenu>                                 {/* the mode picker — the "third button" */}
    <DropdownMenuTrigger asChild>
      <Button variant="outline" aria-label="Search mode" title={…}>
        {modeIcon}
        <span className="hidden sm:inline">{modeLabel}</span>
        <ChevronDown />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuRadioGroup value={mode} onValueChange={(m) => onChange(m as SearchMode)}>
        <DropdownMenuRadioItem value="exact">
          <Equal /> Exact — name matches exactly
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="contains">
          <TextSearch /> Contains — name includes your text
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="fuzzy">
          <Sparkles /> Fuzzy — tolerates typos
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>

  <ButtonGroupText aria-hidden="true"><Search /></ButtonGroupText>  {/* decorative */}
</ButtonGroup>
```

### UI decisions

- **Trigger shows the active mode's icon always**, plus the label text on `sm:` and wider
  (icon-only on mobile to save width). `aria-label` and `title` carry the meaning when the label
  is hidden. This addresses the discoverability cost of an icon-only trigger.
- **Menu items carry icon + label + one-line description** so the three modes self-explain the
  moment the menu opens — no prior knowledge required.
- **Trailing magnifier is decorative.** Search is live-as-you-type (no submit). Rendering it as a
  `ButtonGroupText` addon (no hover, no pointer cursor) signals it is not a clickable button.
- **Glass theming.** `ButtonGroup` and `ButtonGroupText` default to neutral shadcn borders /
  `bg-muted`; override to the app's glass tokens (`--glass`, `--border`) so the control matches the
  existing Ethereal-Glass chrome.
- Lucide icons: Exact = `Equal`, Contains = `TextSearch`, Fuzzy = `Sparkles`, trigger caret =
  `ChevronDown`, decorative = `Search`.

## Files touched

**Matcher / engine**
- `src/store/corpus/fuzzy.ts` — add `SearchMode`; `matchName` param `exact: boolean` → `mode: SearchMode`; tier cutoff logic.
- `src/store/corpus/corpus-engine.ts` — `CorpusQuery.exact?: boolean` → `mode?: SearchMode`; pass `q.mode ?? "fuzzy"`.

**Query model**
- `src/lib/card-query.ts` — `ListSearch.exact` → `mode: SearchMode`; map in `buildCorpusQuery`.
- `src/lib/list-search.ts` — `LIST_SEARCH_DEFAULTS` (`mode: "fuzzy"`); `validateListSearch` parse + enum-guard `mode`; `listSearchToUrl` serialize `mode`, omit when `"fuzzy"`.
- `src/lib/serialized-query.ts` — map `exact` → `mode`.

**Persistence (binders / server)**
- `src/store/userland/types.ts` — `SerializedQuery.exact` → `mode: SearchMode`.
- `src/store/userland/binder-progress.ts` — read `mode` instead of `exact`.
- `src/lib/binder-rule-label.ts` — suffix `(exact)` / `(contains)` for non-fuzzy rules; no suffix for fuzzy.
- `src/server/corpus-server.ts` — server-fn input parse + enum-validate `mode` (fallback `"fuzzy"`).
- `src/routes/search.tsx` — `loaderDeps` and server call use `mode`.

**UI**
- Delete `src/components/islands/match-mode-toggle.tsx` and `match-mode-toggle.test.tsx`.
- Add `src/components/islands/search-mode-menu.tsx` (+ test) — the `ButtonGroup` + `DropdownMenu` control.
- `src/components/islands/search-controls.tsx` — restructure the input row into the `ButtonGroup`.
- `src/components/islands/pill-toggle.tsx` — unchanged (still used by other toggles).

**Tests**
- `src/store/corpus/fuzzy.test.ts` — add Exact-mode cases (substring must NOT match in Exact).
- `src/store/corpus/corpus-engine.test.ts` — update `exact` → `mode`.
- `src/components/islands/search-controls.test.tsx` — update for the new control.
- Any binder / serialized-query specs asserting the `exact` field.

## Testing strategy

- **Matcher unit (`fuzzy.test.ts`):** for a known name, assert Exact rejects a substring query,
  Contains accepts it, Fuzzy accepts a 1-edit typo. Lock the normalized-exact behavior
  (`mr. mime` → "Mr Mime") with a case.
- **Engine (`corpus-engine.test.ts`):** seed a small index; assert each mode returns the expected
  card set for the same query.
- **UI (`search-mode-menu.test.tsx` / `search-controls.test.tsx`):** render, open the menu, select
  a mode, assert `onChange` fires with the right `SearchMode`; assert the active mode's label/icon
  shows on the trigger.

## Out of scope

- No change to relevance ranking, filters, year range, or owned/missing.
- No submit button / no change to live-as-you-type search.
- No persisted user preference for a default mode (default is fixed at Fuzzy).

# SortControl + `/pokemon` search parity

**Date:** 2026-06-28
**Status:** Approved (brainstorm), ready for plan
**Branch:** c/recursing-wilson-38e051

## Summary

Two related improvements, shipped in two phases:

- **Phase 1 — `/pokemon` parity:** bring the Pokédex directory's controls to the
  same standard as the card pages — add the Exact/Contains/Fuzzy **search-mode
  selector**, add a **ResultsBar** (`"{N} species"` + sort), and replace the
  in-panel sort dropdown with a new **`SortControl`** group-button (sort-mode
  dropdown + ASC/DESC toggle).
- **Phase 2 — card-pages rollout:** add user-facing sorting to every card list
  page (search, set, trainer, energy, pokemon/$name) by wiring `sort`/`dir`
  through the shared query pipeline and placing the same `SortControl` in the
  card `ResultsBar`, after the Timeline toggle.

The `SortControl` is a generic, reusable component shared by both.

## Context (current state)

- **No user sort exists on card pages today.** `queryCorpus`
  ([corpus-engine.ts](../../../src/store/corpus/corpus-engine.ts)) orders by a
  fixed context rule: relevance when a query is present, release-date across
  sets, collector-number within a set. `ListSearch`
  ([card-query.ts](../../../src/lib/card-query.ts)) has no `sort`/`dir`.
- **`ResultsBar`** ([results-bar.tsx](../../../src/components/results-bar.tsx))
  is the shared toolbar: a `"{count} cards"` label + a right-aligned actions
  slot. Card pages fill the slot with `SelectAndBulkAdd` + `ViewModeToggle`
  (the Timeline pill).
- **`SearchModeMenu`**
  ([search-mode-menu.tsx](../../../src/components/islands/search-mode-menu.tsx))
  is the Exact/Contains/Fuzzy dropdown, driven by `SearchMode` from
  [fuzzy.ts](../../../src/store/corpus/fuzzy.ts) and designed to fuse inside a
  `ButtonGroup`. `matchName(queryNorm, nameNorm, nameTokens, mode)` is the
  matcher.
- **`/pokemon`** uses bespoke `PokedexControls` + a local `PokedexFilter`
  (`query`/`type`/`generation`/`sort`), substring-only search, and an in-panel
  sort `Select`. The species rows come from `getPokedexFn` → `PokedexRow`.

## Component: `SortControl` (shared)

`src/components/sort-control.tsx` — a `ButtonGroup` with two fused segments,
mirroring the ResultsBar's `[Select cards | All ▾]` pattern:

- **Left:** a `DropdownMenu` (radio group, like `SearchModeMenu`) whose trigger
  shows the active mode's label + a chevron.
- **Right:** an icon `Button` toggling direction — `ArrowUp` (asc) / `ArrowDown`
  (desc), `aria-label` "Sort ascending"/"Sort descending".

Generic over the mode string:

```ts
type SortDir = "asc" | "desc";
interface SortOption<T extends string> { value: T; label: string }
interface SortControlProps<T extends string> {
  mode: T;
  dir: SortDir;
  options: SortOption<T>[];
  onModeChange: (mode: T) => void;
  onDirChange: (dir: SortDir) => void;
  /** Disable the direction toggle (e.g. the card "Default" mode). */
  dirDisabled?: boolean;
}
```

The component is presentational/dumb. **Direction reset on mode change is the
consumer's job** (each page maps a mode to its natural default direction).

## Phase 1 — `/pokemon` parity

### Search-mode selector
Add `SearchModeMenu` fused into the `PokedexControls` `ButtonGroup`
(`[ search input | SearchModeMenu | filter toggle ]`), exactly as the card
`SearchControls` does. `PokedexFilter` gains `searchMode: SearchMode`
(default `"fuzzy"`).

### Species name matching honors the mode
`applyPokedexFilter` stops using plain substring and uses the corpus matcher:
for a non-empty query, a row is included when
`matchName(normalize(query), normalize(row.name), tokensOf(row.name), searchMode)`
is non-null, **or** the query is numeric and `String(row.dex)` includes it (keep
the dex-number search). 1020 rows × a normalize+match per keystroke is cheap;
no precomputed index needed.

### ResultsBar + SortControl
Add a `ResultsBar` to the `/pokemon` route: `"{N} species"` on the left, the
`SortControl` on the right. Sort moves **out of** the filter panel into this
row, so the page is structurally parallel to the card pages. `ResultsBar` gains
an optional `unit` prop (default `"cards"`); `/pokemon` passes `unit="species"`.

### Sort modes (species)
`PokedexFilter` replaces `sort` with `sortMode` + `sortDir`:

| Mode | value | natural default dir |
| --- | --- | --- |
| Dex # | `dex` | asc |
| Name | `name` | asc |
| Card Count | `count` | desc |

`applyPokedexFilter` sorts by `sortMode`/`sortDir` (the old "Most cards" is now
`count` + `desc`). On mode change the route resets `sortDir` to that mode's
natural default.

### Phase-1 testing
- `applyPokedexFilter`: search-mode matching (exact/contains/fuzzy + numeric dex
  fallback); each sort mode × both directions.
- `PokedexControls`: renders the `SearchModeMenu`; mode change fires onChange.
- `SortControl`: renders options + direction toggle; mode/dir callbacks fire;
  `dirDisabled` disables the toggle.
- Route still renders the species count + grid (existing tests adjusted for the
  new state shape).

## Phase 2 — card-pages rollout

### `ListSearch` gains sort
Add to `ListSearch` / `LIST_SEARCH_DEFAULTS` / `validateListSearch` /
`listSearchToUrl`:

```ts
type CardSortMode = "default" | "dex" | "number" | "name" | "released";
sort: CardSortMode;  // default "default"
dir: SortDir;        // default "asc"
```

Validated (enum-guard, else defaults), serialized to the URL, and stripped when
default so crawlable URLs stay clean.

### Query honors sort
`CorpusQuery` gains `sort?: CardSortMode` + `dir?: SortDir`; `buildCorpusQuery`
forwards them. In `queryCorpus`'s comparator:

- `sort === "default"` (or unset) → **current behavior, unchanged** (relevance /
  release-date / collector-number). Fully backward-compatible.
- otherwise sort by the chosen field, then flip for `dir`:
  - `dex` → first `nationalPokedexNumbers` (cards without one sort last);
  - `number` → `compareCardNumber`;
  - `name` → `localeCompare`;
  - `released` → set release date.

### SortControl in the card ResultsBar
Add `SortControl` to the card `ResultsBar` **after** `ViewModeToggle` (Timeline),
wired to `search.sort`/`search.dir` → `navigate`. Card sort options:

| Mode | value | default dir |
| --- | --- | --- |
| Default | `default` | — (dir disabled) |
| Dex # | `dex` | asc |
| Card # | `number` | asc |
| Name | `name` | asc |
| Release date | `released` | asc |

Touch every page that renders `ResultsBar`: `CardListPage` (covers
trainer/energy + their `$name` pages), the search page, the set page
(`$series/$set`), and `pokemon/$name`.

### Phase-2 testing
- `validateListSearch`: `sort`/`dir` enum-guard + defaults; `listSearchToUrl`
  omits defaults, serializes non-defaults.
- `queryCorpus`: each explicit mode × direction orders correctly; `default`
  matches the pre-change order (snapshot the current order for one query).
- A card page's `ResultsBar` includes the `SortControl` after Timeline and a
  mode/dir change drives a `navigate` with the right params.

## Assumptions (confirmed)
- Search-mode on `/pokemon` actually filters species via the fuzzy/exact/contains
  engine (A1).
- `/pokemon`'s results row = species count + SortControl only; not
  Select-cards/owned/Timeline (A2).
- Card sort modes = Default · Dex # · Card # · Name · Release date; "Default"
  preserves current ordering, nothing regresses (A3).
- Card sort persists in the URL, like the other filters (A4).
- Card Count is a species-only sort mode (a card has no count of its own).
- Phase 1 ships first; Phase 2 follows (A5).

## Out of scope (YAGNI)
- Sorting cards by price, rarity tier, or HP.
- Per-user persisted default sort (URL params are enough).
- Multi-key sort.

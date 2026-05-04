# Phase 1 / #5 — Advanced Filters

**Date:** 2026-05-03
**Status:** Implemented
**Roadmap phase:** 1 of 5 (second feature; depends on Phase 1 #4's URL-state foundation)

## Context

The viewer browses cards along two primary axes (By-Set, By-Pokémon) but offers no secondary filtering. A user looking at Crown Zenith cannot ask "show only Rare Holo VMAX" without scrolling through ~160 cards. The pokemontcg.io API supports rich query operators (`types:fire`, `rarity:"Rare Holo VMAX"`, `supertype:Pokémon`, `subtypes:VMAX`) that compose with AND, but the current API client only sends the primary clause (set or pokédex number).

This phase adds a persistent filter chip row to both pages with four dimensions — type, rarity, supertype, subtype — each multi-select. Filter state lives in URL params, composing with the existing `setId` / `dex` selection from Phase 1 #4.

## Goals

1. From either browse mode, users can filter by type, rarity, supertype, and subtype with multi-value selection per dimension.
2. Filter values fetched live from the API so new TCG sets' rarities/subtypes appear automatically without code changes.
3. Filter state is URL-backed and shareable: `/?setId=swsh12pt5&types=fire,water&rarity=Rare%20Holo%20VMAX`.
4. Filters compose naturally with the existing primary selection (set or pokédex). Within a dimension values OR; across dimensions AND.
5. Active filters are visible at all times via chip state ("Type · Fire +1"); a single "Clear filters" link resets everything.
6. Existing 42 tests continue to pass.

## Non-goals

- HP range filtering — different UI pattern (numeric range), separate spec.
- Attack damage filtering — same.
- Custom sort orders — current ordering (set release date / card number) is acceptable.
- Saved or named filter sets ("My VMAX collection") — premature.
- Filter analytics or popularity badges — out of scope.
- Conditional hiding of supertype filter on the Pokémon page — accepts the empty-results edge case for v1.

## Approach

### URL state

Four new search params added to the existing scheme:

- `?types=fire,water` — comma-separated lowercase type names
- `?rarity=Rare%20Holo,Rare%20Holo%20VMAX` — comma-separated rarity strings (URL-encoded)
- `?supertype=Pokémon` — single supertype in practice but multi-value capable
- `?subtypes=Basic,VMAX` — comma-separated subtypes

A single new generic hook in `src/hooks/use-url-selection.ts`:

```ts
export function useFilterParam(name: string): [string[], (vals: string[]) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(name);
  const values = raw ? raw.split(",").filter(Boolean) : [];
  const setValues = (vals: string[]) => {
    const next = new URLSearchParams(params);
    if (vals.length === 0) next.delete(name);
    else next.set(name, vals.join(","));
    setParams(next);
  };
  return [values, setValues];
}
```

Each chip wires `useFilterParam("types")` / `useFilterParam("rarity")` / etc.

### Filter values data source

Four new `/v2/...` endpoints exposed by pokemontcg.io return string arrays of all currently valid values:

- `GET /v2/types` → `["Colorless", "Darkness", "Dragon", ...]` (~11 values, stable)
- `GET /v2/subtypes` → `["Basic", "Stage 1", "VMAX", ...]` (~25 values, grows with new sets)
- `GET /v2/supertypes` → `["Energy", "Pokémon", "Trainer"]` (3 values, stable)
- `GET /v2/rarities` → `["Rare Holo", "Rare Holo VMAX", ...]` (~30+ values, grows with new sets)

These are fetched lazily via the same `loadX` / `freshness` pattern Phase 0 established for sets and pokémon list. Persisted to localStorage via `partialize`. **No `STORAGE_VERSION` bump needed** — the change is additive (new fields with `null` defaults), so existing users' cached sets list and pokémon list survive the upgrade and the new filter-value fields populate on first use.

Four new functions in `src/api.ts`:

```ts
export async function getTypes(): Promise<string[]>;
export async function getSubtypes(): Promise<string[]>;
export async function getSupertypes(): Promise<string[]>;
export async function getRarities(): Promise<string[]>;
```

Each calls the corresponding `/v2/X` endpoint and returns `data` from the JSON response.

### Cache slice extension

`src/store/api-cache-slice.ts` gains:

```ts
export interface ApiCacheSlice {
  // ...existing fields...

  types: string[] | null;
  typesFetchedAt: number | null;
  typesLoading: boolean;
  rarities: string[] | null;
  raritiesFetchedAt: number | null;
  raritiesLoading: boolean;
  supertypes: string[] | null;
  supertypesFetchedAt: number | null;
  supertypesLoading: boolean;
  subtypes: string[] | null;
  subtypesFetchedAt: number | null;
  subtypesLoading: boolean;

  loadTypes: () => Promise<void>;
  loadRarities: () => Promise<void>;
  loadSupertypes: () => Promise<void>;
  loadSubtypes: () => Promise<void>;
}
```

Each `loadX` mirrors the existing `loadSets` / `loadPokemonList` shape — guards on in-flight + freshness, sets loading flag, fetches, stores result + fetchedAt timestamp.

A new `freshness` kind enum entry per dimension if the freshness module needs it (currently it differentiates by kind for different TTLs; filter values are stable enough to share one TTL — likely "longer" since they don't change often).

### `useFilterValues` hook

`src/hooks/use-filter-values.ts`:

```ts
export function useFilterValues(): {
  types: string[];
  rarities: string[];
  supertypes: string[];
  subtypes: string[];
} {
  const types = useStore((s) => s.types) ?? [];
  const rarities = useStore((s) => s.rarities) ?? [];
  const supertypes = useStore((s) => s.supertypes) ?? [];
  const subtypes = useStore((s) => s.subtypes) ?? [];
  const loadTypes = useStore((s) => s.loadTypes);
  const loadRarities = useStore((s) => s.loadRarities);
  const loadSupertypes = useStore((s) => s.loadSupertypes);
  const loadSubtypes = useStore((s) => s.loadSubtypes);

  useEffect(() => { loadTypes(); }, [loadTypes]);
  useEffect(() => { loadRarities(); }, [loadRarities]);
  useEffect(() => { loadSupertypes(); }, [loadSupertypes]);
  useEffect(() => { loadSubtypes(); }, [loadSubtypes]);

  return { types, rarities, supertypes, subtypes };
}
```

Same shape pattern as the existing `usePokemonList`.

### `<FilterChipRow>` component

New module at `src/components/filter-chip-row/`:

```
filter-chip-row/
├── index.ts
├── filter-chip-row.tsx
├── filter-chip.tsx
├── filter-chip-row.css
├── filter-chip-row.test.tsx
└── filter-chip.test.tsx
```

`FilterChipRow` is a thin orchestrator that renders 4 `<FilterChip>` instances and a "Clear filters" link visible only when at least one filter is active. The link clears all four URL params at once (calls each setter with `[]`).

```tsx
interface FilterChipRowProps {
  types: string[];      // available options
  rarities: string[];
  supertypes: string[];
  subtypes: string[];
}
```

### `<FilterChip>` component

```tsx
interface FilterChipProps {
  label: string;        // "Type"
  paramName: string;    // "types" — the URL param key
  options: string[];    // available values for this dimension
}
```

Behavior:

- **Inactive state**: button styled as a small pill with the label and a downward chevron ("Type ▾").
- **Active state**: shows preview ("Type · Fire" if 1, "Type · Fire +2" if 3 selected). A small `×` button on the chip clears just this dimension.
- **Click opens popover**: anchored below the chip, contains a scrollable checkbox list of `options`. Click any value to toggle (URL updates immediately, no Apply button). Click outside the popover to close.
- **Long lists**: popover has `max-height: 400px` with `overflow-y: auto`. Rarity (~30) and subtype (~25) lists scroll. No search filter inside the popover for v1 — start simple.
- **Keyboard**: chip is focusable; Enter/Space opens popover; Escape closes; Tab through checkboxes inside.

Implementation reads its own `useFilterParam(paramName)` so the parent doesn't have to thread state through.

### API client extension

A new helper in `src/api.ts`:

```ts
function buildFilterClauses(filters: {
  types?: string[];
  rarity?: string[];
  supertype?: string[];
  subtypes?: string[];
}): string {
  const clauses: string[] = [];
  if (filters.types?.length)
    clauses.push(`(${filters.types.map((t) => `types:${t}`).join(" OR ")})`);
  if (filters.rarity?.length)
    clauses.push(`(${filters.rarity.map((r) => `rarity:"${r}"`).join(" OR ")})`);
  if (filters.supertype?.length)
    clauses.push(`(${filters.supertype.map((s) => `supertype:${s}`).join(" OR ")})`);
  if (filters.subtypes?.length)
    clauses.push(`(${filters.subtypes.map((s) => `subtypes:${s}`).join(" OR ")})`);
  return clauses.length === 0 ? "" : ` AND ${clauses.join(" AND ")}`;
}
```

`getCardsBySet` and `getCardsByPokedexNumber` accept an optional `filters` param and append the result of `buildFilterClauses(filters)` to their primary query string.

Rarity values need quoting because they contain spaces (`rarity:"Rare Holo VMAX"`). The other dimensions are single tokens.

### Cache key composition in `useCards`

Today, `useCards` caches per `selectedKey` (a string). Changing filters needs to invalidate the cache for that key.

**Approach (minimal change):** the page builds a composite cache key by appending the active filter URL params. E.g. for SetsPage:

```ts
const filterSig = useFilterSignature();  // memoized "types=fire&rarity=Rare%20Holo" or ""
const cacheKey = selectedSetId
  ? filterSig ? `${selectedSetId}|${filterSig}` : selectedSetId
  : null;
```

The fetcher closure parses the cacheKey back into `(setId, filters)` for the API call. (Or an alternative: the fetcher closes over `filters` directly and the cacheKey is just for identity — see Open questions.)

The cleanest realization is to introduce a small `useFilterSignature()` helper that returns a deterministic string from the current filter URL state, and the pages compose `${primary}|${filterSignature}` as the key. Same pattern works for both pages.

Per-filter-combo caching falls out naturally: toggling Fire on/off returns instantly the second time because the keys match a previously-fetched entry.

### Page integration

**SetsPage:**

```tsx
const filterValues = useFilterValues();
// ...existing setId logic...
return (
  <>
    <Header currentSet={currentSet} />
    <SeriesTabs ... />
    <SetTabs ... />
    <FilterChipRow
      types={filterValues.types}
      rarities={filterValues.rarities}
      supertypes={filterValues.supertypes}
      subtypes={filterValues.subtypes}
    />
    <CardGrid setId={cacheKey} cards={cards} ... renderOverlay={renderOverlay} />
    {loading && <div className="loading-pill">Loading…</div>}
  </>
);
```

**PokemonPage:** same pattern — `<FilterChipRow>` between `<PokemonFilter>` and `<CardGrid>`.

The filter row is always rendered (even on the empty state of PokemonPage when no Pokémon selected) for consistency. Slight clutter when there's nothing to filter, but uniform UX.

### Cross-page filter persistence

URL params persist across navigation. Clicking a cross-link from a filtered SetsPage to PokemonPage carries `types=fire` over. Browser back/forward restores filters too (URL is canonical).

Edge case: `supertype=Trainer` on the PokemonPage produces zero results (pokédex numbers are Pokémon-only). Empty state communicates the mismatch. We accept this rather than introducing per-page filter visibility logic.

### Migration steps (for the plan)

1. Add `getTypes`/`getSubtypes`/`getSupertypes`/`getRarities` API client functions.
2. Extend `ApiCacheSlice` with the four new filter-value fields + four `loadX` actions; update `partialize` to mirror them. No `STORAGE_VERSION` bump (purely additive).
3. Add `useFilterValues` hook.
4. Add `useFilterParam` generic hook to `use-url-selection.ts`.
5. Add `buildFilterClauses` helper to `api.ts`; extend `getCardsBySet` and `getCardsByPokedexNumber` with optional `filters` param.
6. Build `<FilterChip>` component (TDD).
7. Build `<FilterChipRow>` component (TDD).
8. Add `useFilterSignature` helper for cache-key composition (or inline the same logic in pages).
9. Wire SetsPage and PokemonPage to render `<FilterChipRow>` and compose filtered cache keys.
10. Run all existing 42 tests + new tests, fix any regressions.

## Verification

- All existing 42 tests pass.
- New unit tests:
  - `useFilterParam` — read, write, clear, ignore empty CSV components (4 cases).
  - `buildFilterClauses` — empty, single dimension, multiple dimensions, rarity quoting (4 cases).
  - `<FilterChip>` — inactive label, active label preview, popover open/close, multi-select toggle commits to URL, clear button (5 cases).
  - `<FilterChipRow>` — renders 4 chips, "Clear filters" link only when active, clear-all functionality (3 cases).
  - `useFilterValues` — returns shape with empty arrays before load, populated arrays after (smoke test).
- Manual smoke:
  - Apply Fire type filter on Crown Zenith → URL becomes `/?setId=swsh12pt5&types=fire`, grid shows fire cards only.
  - Toggle off Fire → URL drops `types`, grid restores full set.
  - Multi-select Fire + Water → grid shows both. Verify URL is `types=fire,water`.
  - Switch to By-Pokémon (still with `types=fire` set, plus a `dex`); grid shows that Pokémon's fire cards.
  - Reload page directly with filter URL — filter reapplied without interaction.
  - Click "Clear filters" — URL returns to bare `?setId=...`, all chips reset.
- Lint, typecheck, build, all clean.

## Open questions

None at design time. Ambiguities to resolve during implementation:

- The cache-key composition could either go via a `useFilterSignature` helper or be inlined in each page. Implementer's call — both are reasonable; the helper is DRY-er, the inline version is shorter for two callers. Default to the helper.
- The `supertype` filter is in practice single-select in the data (a card has exactly one supertype) but the URL hook is multi-select capable for symmetry. The popover UI doesn't need to enforce single-select — selecting all three supertypes effectively means "no filter", which is fine.
- Filter chips should probably collapse on mobile screens (multiple small chips on a 360px viewport gets crowded). Worth a quick `@media` rule but not blocking — start with the desktop layout.

## Risks

- **Filter values endpoint shape:** the spec assumes `/v2/types` etc. return `{ data: string[] }`. If the actual response shape differs (e.g., wrapped objects), the API client functions need tweaking. Mitigation: implementer verifies the response format before writing the client.
- **Cache invalidation on filter change:** if the cache-key composition is wrong (e.g., the filter signature isn't stable across renders), `useCards` could either thrash (refetch on every render) or not invalidate (stale data). Mitigation: tested via the `useFilterParam` and `useFilterSignature` unit tests.
- **Popover positioning across browsers:** anchored popovers are a known pain point (Safari, mobile keyboards, etc.). Mitigation: use a known-stable approach (CSS `position: absolute` relative to the chip's container) rather than a heavier popover library. v1 doesn't need full keyboard navigation collapse; iterate if needed.
- **Long URL with many filters:** `/?setId=...&types=fire,water,grass&rarity=Rare%20Holo,Rare%20Holo%20VMAX,Rare%20Rainbow,Rare%20Secret&supertype=Pokémon&subtypes=Basic,Stage%201,VMAX` — readable but ~200 chars. Browsers handle ~2000 char URLs fine. Acceptable.

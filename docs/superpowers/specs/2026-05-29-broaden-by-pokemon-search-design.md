# Broaden "By Pokémon" → Free-Text Card Search

**Date:** 2026-05-29
**Status:** Approved (design)
**Depends on:** Phase 1 #4 (URL-state foundation), Phase 1 #5 (filter chip row)

## Context

The "By Pokémon" page searches along a single axis: **national Pokédex number**. The
search box (`PokemonFilter`) autocompletes against a PokeAPI national-dex name list,
resolves the picked name to a Pokédex number (list index + 1), writes it to `?dex=N`,
and the page queries the pokemontcg.io API with `nationalPokedexNumbers:N`.

Trainer and Energy cards carry **no** `nationalPokedexNumbers`, so they are structurally
unreachable through this axis. The existing supertype filter chip (Pokémon / Trainer /
Energy) cannot rescue them — the primary clause has already excluded every non-Pokémon
card upstream. A user cannot search "Erika", "Professor's Research", or "Boss's Orders".

Verified against the live API (`GET /v2/cards?q=...`):

- `name:professor*` → 85 results, all **Trainer**.
- `name:erika` → 46 results, mixing **Pokémon** (`Erika's Clefable`) and **Trainer** (`Erika`).
- Wildcards supported: prefix (`char*` → 238), leading+trailing (`*char*` → 264, catches `Chimchar`).

So a free-text **card-name** query reaches every supertype. This spec switches the page's
primary axis from Pokédex number to free-text card name.

## Goals

1. The page's search box accepts free text and returns **all** matching cards — Pokémon,
   Trainer, and Energy — by name.
2. Substring ("contains") matching: typing `boss` finds `Boss's Orders`; `prof` finds
   `Professor's Research`.
3. Search state is URL-backed and shareable: `/pokemon?q=charizard`.
4. The four existing filter chips (type, rarity, supertype, subtype) still compose with
   the name query (within a dimension OR; across dimensions AND).
5. Cross-links that previously meant "view all cards of this Pokémon" now name-search by
   species name (`/pokemon?q=Charizard`) — broader, and consistent with the new axis.
6. Both view modes (grid, timeline) keep working unchanged.
7. The dev-only holo-debug page is untouched (it keeps its own Pokédex-number control).

## Non-goals

- **Hybrid dual-axis** (keeping `?dex=` alongside `?q=`). Rejected for a single clear axis;
  see Alternatives.
- **TCG-API suggestion dropdown** (debounced name suggestions across supertypes). The
  results grid is the answer surface; a parallel suggestion list duplicates it. Possible
  later enhancement, out of scope now.
- **Field-scoped search** beyond name (attack text, ability text, flavor text, artist).
  Name-only for v1.
- **Fuzzy / typo-tolerant matching.** Substring wildcard only.
- **Removing** `getCardsByPokedexNumber` / `usePokedexParam` / `PokemonFilter` — still
  consumed by the holo-debug page; left in place.

## Approach

### Primary axis: replace Pokédex number with card name

The page reads a new `?q=` search param (free text) instead of `?dex=`. A new API helper
builds a name query; the page wires it through the existing `useCards` pagination hook.

### API client — `src/api.ts`

Add a name-search helper alongside the existing query builders:

```ts
export function getCardsByName(
  name: string,
  page: number,
  pageSize: number,
  filters?: FilterClauses,
): Promise<{ cards: HoloCardData[]; totalCount: number }> {
  return getCardsByQuery(
    `name:"*${escapeLucene(name)}*"${buildFilterClauses(filters ?? {})}`,
    page,
    pageSize,
    "set.releaseDate,number",
  );
}
```

- `escapeLucene(name)` escapes pokemontcg.io / Lucene query specials so user input cannot
  break out of the clause. At minimum escape `"` and backslash; strip or escape `:` and
  the wildcard chars `*` `?` so they are treated literally. Exact escape set pinned in the
  plan with a unit test (`Mr. Mime`, `Farfetch'd`, `"`, `: `).
- `getCardsByPokedexNumber` is **retained** unchanged (holo-debug page consumer).
- `orderBy` matches the current By-Pokémon ordering: `set.releaseDate,number`.

### URL param — `src/hooks/use-url-selection.ts`

Add a string param hook mirroring the existing pattern:

```ts
export function useNameQueryParam(): [string, SetNameQuery] {
  // reads ?q=, trimmed; "" when absent. Setter deletes the param on empty.
}
```

- Empty string ⇒ param removed from the URL (consistent with `useViewModeParam` default
  behavior).
- `usePokedexParam` retained (holo-debug page consumer).

### Component — new `src/components/card-search.tsx`

A focused free-text search input (`CardSearch`). Replaces `PokemonFilter` **on this page
only**; `PokemonFilter` is left untouched so the holo-debug page keeps compiling.

Props:

```ts
interface CardSearchProps {
  value: string;
  onChange: (query: string) => void;
}
```

Behavior:

- Controlled text input; local state mirrors keystrokes for responsiveness.
- **Debounced commit** (~300 ms) calls `onChange(trimmed)` → writes `?q=`. `Enter` forces
  an immediate commit; `Escape` / clear button (`×`) resets to `""`.
- No autocomplete dropdown (YAGNI — the grid is the result surface).
- Reuses the existing `pokemon-filter.css` visual language (own `card-search.css`, same
  input + clear-button styling) for a consistent look.
- Accessible: `role="searchbox"` / labelled input, `aria-label="Search cards by name"`.

### Page — `src/pages/pokemon-page.tsx`

- Swap `usePokedexParam` → `useNameQueryParam`; `PokemonFilter` → `CardSearch`;
  `getCardsByPokedexNumber` → `getCardsByName`.
- Cache key derives from `q` + the existing `filterSig` (same scheme as today, with the
  query string substituted for the dex base key). Empty `q` ⇒ `null` key ⇒ empty grid +
  prompt copy.
- Header / empty-state copy updated:
  - Title block label "Filter by Pokémon" → "Search cards".
  - Prompt (empty): "Search any card by name — Pokémon, Trainer, or Energy".
  - Active: `"${q}" · ${cards.length} cards loaded`.
- `ViewModeToggle` disabled when `q` is empty (same as the current dex-null guard).

### Cross-links — name-search by species name

Both call sites already have the species `name` in scope:

- `src/pages/card-page.tsx:118` — `to: \`/pokemon?q=${encodeURIComponent(name)}\``
  (label "View all {name}" unchanged).
- `src/pages/sets-page.tsx:95` — same substitution.

### Nav — `src/root-layout.tsx`

NavLink label "By Pokémon" → "Search". Route path `/pokemon` unchanged (avoids touching
the route table, the debug page, and deep-link compatibility for the path itself).

### Unchanged

- `FilterChipRow`, `buildFilterClauses`, `useFilterParam`, `useFilterValues` — filters
  compose with the name query exactly as they did with the dex query.
- `PokemonTimeline`, `CardGrid` — render whatever cards the fetcher returns.
- `useCards` — generic, keyed by string; no change.

## Data flow

```
CardSearch (debounced) ──onChange──▶ useNameQueryParam ──?q=──▶ PokemonPage
                                                                      │
                              filter chips ──?types=…&rarity=…──▶  cacheKey = q | filterSig
                                                                      │
                                                                      ▼
                                              getCardsByName(q, page, size, filters)
                                                       │  name:"*q*" AND (filters…)
                                                       ▼
                                              getCardsByQuery → pokemontcg.io
                                                       ▼
                                              useCards (paginate/cache/dedupe)
                                                       ▼
                                              CardGrid / PokemonTimeline
```

## Error / edge handling

- **Empty / whitespace query** ⇒ no fetch, prompt copy, disabled view toggle (mirrors the
  current `pokedexNumber === null` guard).
- **No results** ⇒ existing empty grid (header shows `0 cards loaded`). No special UI.
- **Query injection** ⇒ `escapeLucene` neutralizes quotes, colons, wildcards, backslashes
  so a pasted string cannot alter clause structure or error the API.
- **Punctuation / multiword names** (`Mr. Mime`, `Farfetch'd`) ⇒ substring match on the
  literal text; documented limitation that periods inside `"*mr mime*"` won't match
  `Mr. Mime`. Accepted for v1 (the cross-link species names are the common path and match
  cleanly).
- **API failure** ⇒ existing `useCards` `catch` → `console.error`, grid stays as-is.
- **Rapid typing** ⇒ debounce coalesces; each committed `q` is a distinct `useCards` key,
  so older in-flight pages don't clobber newer ones.

## Testing

New:

- `getCardsByName` — builds `name:"*q*"` clause, escapes specials, appends filter clauses,
  uses the right `orderBy`.
- `escapeLucene` — quotes, colon, wildcard, backslash, apostrophe cases.
- `useNameQueryParam` — read trims, absent ⇒ `""`, setter writes/deletes `?q=`.
- `CardSearch` — debounced commit, Enter forces immediate, clear resets, value reflects
  prop.

Updated:

- `src/pages/card-page.test.tsx:158` — cross-link href `/pokemon?dex=25` → `/pokemon?q=…`.
- `src/components/cross-link-overlay/cross-link-overlay.test.tsx` — fixture hrefs (these
  are component-local fixtures; update to `?q=` to keep them representative).
- `src/components/card-grid.test.tsx:37` — overlay-link fixture href.

Retained as-is:

- `src/hooks/use-url-selection.test.tsx` `usePokedexParam` suite (hook still exists).

Full suite (currently green) must stay green.

## Alternatives considered

- **Hybrid dual-axis** (`?q=` precedence, `?dex=` still honored). Zero cross-link/test
  churn and preserves exact "same Pokédex number" grouping, but adds a second param plus
  branching in both the page and the search box, and offers two near-identical ways to do
  the same thing. Rejected for a single clear axis; the churn that Replace adds is small
  and directly entailed by the feature.
- **Rework `PokemonFilter` in place** (free-text, drop the PokeAPI list). Breaks the
  holo-debug page's `value/onChange` (dex-number) contract. A new `CardSearch` component is
  cleaner and leaves the debug page alone.
- **Minimal in-place broadening** (no name search). Non-viable: there is no free-text path
  today, and the PokeAPI autocomplete list is Pokémon-only by construction.

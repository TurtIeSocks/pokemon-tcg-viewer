# Pokémon species filter — design

**Date:** 2026-06-07
**Status:** Approved (delegate-mode brainstorm)

## Goal

Add one more filter select to the card-list search controls: a **Pokémon**
(species) filter. It shows which Pokémon are available in the current list of
cards and narrows the grid to one chosen species.

The filter is **by species**, collapsing name variants: "Rhydon", "Brock's
Rhydon", and "Dark Rhydon" are all **Rhydon**.

## Core idea — group by national Pokédex number

Do **not** parse card-name strings to recover the species. Every Pokémon card
already carries `nationalPokedexNumbers: number[]`; all name variants of a
species share the same dex number ("Brock's Rhydon" and "Rhydon" are both
**112**). The dex number is the grouping key.

This reuses the `dexNumber` rail that already runs end-to-end:

- `queryCorpus` (`corpus-engine.ts`) already filters
  `card.nationalPokedexNumbers?.includes(q.dexNumber)`.
- `SerializedQuery.dexNumber` (binder smart-rules) is a single `number | null`.
- The `/pokemon/$name` route already drives the grid via `dexNumber` context.
- `binderRuleLabel` already renders a `dexNumber` via a `dexName` resolver.

The species filter is, in effect, "let the user set `dexNumber` from a dropdown
on the search and set pages" rather than only via the `/pokemon` route.

### Edge cases (all intended behavior)

- **Multi-dex cards** — Tag Team cards carry more than one dex number
  ("Pikachu & Zekrom" = `[25, 644]`). Such a card appears under *both* species
  options, and selecting either species includes it.
- **Non-Pokémon cards** — Trainer / Energy cards have no dex number. They are
  absent from the species options and are filtered out when any species is
  selected. Correct: they are not Pokémon.
- **Composition** — the species filter ANDs with every other active filter
  (text query, type, rarity, supertype, subtype, year, owned) in `queryCorpus`.

## Scope — where the filter appears

| Route                | Show filter? | Options completeness                         |
| -------------------- | ------------ | -------------------------------------------- |
| `/search`            | Yes          | Seed-limited (top 40 results)                |
| `/$series/$set`      | Yes          | Complete (facets derived over the whole set) |
| `/pokemon/$name`     | No           | Redundant — already one species              |

`/pokemon/$name` is excluded both because a species filter is meaningless there
and because its `dexNumber` page context would take precedence over the filter
value anyway.

## Changes by file

### 1. URL param + types — `src/lib/card-query.ts`, `src/lib/list-search.ts`

Add `pokemon: number | null` to `ListSearch` (a national dex number; `null` =
no filter). Shape mirrors `yearMin` / `yearMax`.

- `LIST_SEARCH_DEFAULTS` → `pokemon: null`.
- `validateListSearch` → parse to an int, accept `1..1025` (the species-list
  upper bound, `MAX_DEX`), else `null`. Accept both number and string forms
  (TanStack JSON-parses, an in-page merge can hand a string) — reuse the same
  tolerance the year parser already uses.
- `listSearchToUrl` → emit `pokemon: String(dex)` when set, `undefined` when
  `null` (so the default stays out of the URL via `stripSearchParams`).

### 2. Query plumbing — `src/lib/card-query.ts` (`buildCorpusQuery`)

No engine change. `buildCorpusQuery` has three return branches: `ctx.setId`
(set page), `ctx.dexNumber` (`/pokemon` page), and the global no-context branch
(`/search`). The species filter is shown on the **set** and **search** pages, so
add the dropdown's dex to those two branches:

```ts
// in the ctx.setId branch and the global branch:
dexNumber: s.pokemon ?? undefined,
```

Leave the `ctx.dexNumber` branch unchanged — that page does not show the filter
and its context dex already drives the query. (Equivalent framing: `dexNumber:
ctx.dexNumber ?? s.pokemon ?? undefined` in every branch; page context wins
where present.) `queryCorpus` already filters on `q.dexNumber` — no change to
`corpus-engine.ts`.

### 3. Facet options — `src/server/set-facets.ts`

Extend `SetFacets`:

```ts
export interface PokemonFacet {
	dex: number;
	name: string;
}

export interface SetFacets {
	// ...existing dims...
	pokemon: PokemonFacet[];
}
```

`deriveFacets(cards, dexName?)` gains an optional name resolver
`(dex: number) => string | null | undefined`:

- Collect the distinct dex numbers across `cards.flatMap(c =>
  c.nationalPokedexNumbers ?? [])`.
- Map each to `{ dex, name }` where `name` is `titleCase(resolved)` when
  `dexName?.(dex)` resolves to a non-empty string, else the `#<dex>` fallback
  (never call `titleCase` on a null/undefined name).
- Sort alphabetically by `name` (matches the other dimensions'
  `localeCompare` sort).
- When no resolver is passed, labels fall back to `#<dex>` and the filter is
  still functional.

### 4. Labels — species name resolution

Authoritative species names come from the PokéAPI species list
(`getPokemonListFn` → `nameByDex` in `src/server/pokemon-dex.ts`), title-cased
the same way `/pokemon/$name` already title-cases its slug. Do **not** reuse the
corpus-derived `dexNameResolver` from `binder-detail.tsx` for labels — it
returns the first matching card's *raw* name ("Brock's Rhydon"), which is the
exact thing this filter must avoid.

Both route loaders fetch the species list (cached and cheap via
`getPokemonListCached`) and pass a `dex => nameByDex(list, dex)` resolver into
`deriveFacets`, computing the labeled `pokemon` facets server-side:

- `/$series/$set` loader already calls `deriveFacets(all)` — add the list fetch
  and pass the resolver.
- `/search` currently computes `deriveFacets(cards)` in the component. Move it
  into the loader (alongside the species-list fetch) and return `facets`, so the
  species labels are SSR-correct — matching how the set route already returns
  `facets` from its loader.

### 5. UI — `src/components/islands/search-controls.tsx`

- New prop `showPokemonFilter?: boolean` (default `false`), set on the search
  and set routes.
- New `PokemonFilterSelect`: a single-select whose value is a dex number
  (`number | null`) and whose options are `facets.pokemon`. It follows the
  existing `FilterSelect` / `YearSelect` pattern — a Radix `Select` with an
  `"__all__"` sentinel for "clear" (Radix forbids an empty-string item value),
  label "Pokémon".
- Filter grid: `sm:grid-cols-5` → `sm:grid-cols-6` when the filter is shown.

### 6. Binder smart-rules — `src/lib/serialized-query.ts`

`toSerializedQuery` captures the species selection so a search-page filter can
become a binder rule:

```ts
dexNumber: ctx.dexNumber ?? search.pokemon ?? null,
```

`isRuleCapturable` already treats `dexNumber !== null` as a constraint, and
`binderRuleLabel` already renders it — no other change needed.

## Testing

- **`deriveFacets`** (`set-facets.test.ts`): distinct + alphabetically sorted
  species options; cards without a dex number contribute no option; a multi-dex
  card contributes an option under each of its species; name resolver applied,
  `#<dex>` fallback when absent.
- **`buildCorpusQuery`** (`card-query.test.ts`): `s.pokemon` maps to
  `q.dexNumber`; `ctx.dexNumber` takes precedence over `s.pokemon`.
- **`validateListSearch` / `listSearchToUrl`** (`list-search.test.ts`):
  round-trip `pokemon` (number ⇄ URL string; out-of-range and junk → `null`;
  default omitted from URL).
- `queryCorpus`'s `dexNumber` path is already covered; no new engine test
  needed since the filter routes through the same field.

## Non-goals

- Multi-species selection (would require reworking the single `dexNumber` rail
  across engine, serialized query, and the `/pokemon` route).
- Pokédex-number ordering of options (alphabetical chosen for consistency with
  the other selects).
- A full-corpus-derived option list on the search page (kept seed-limited to
  match existing filter behavior).
- Name-string parsing of any kind.

# `/pokemon` — Pokédex species directory

**Date:** 2026-06-28
**Status:** Approved (brainstorm), ready for plan
**Branch:** c/recursing-wilson-38e051

## Summary

Add the missing index route at `/pokemon`: a browsable national-dex of every
Pokémon species that has at least one card in the corpus. Each species renders
as a retro pixel-sprite tile (name · dex # · card count · type-color glow) that
links to the existing per-species route `/pokemon/$name`.

This is the distinctive counterpart to `/trainer` and `/energy`. Those are flat
"browse every card of this supertype" lists, which works because Trainer/Energy
are minority supertypes. Pokémon is ~15k of ~20k cards, so a flat list would
duplicate `/search`. Instead `/pokemon` is a **species directory** — it leans on
the national-dex identity that `/pokemon/$name` is already keyed by.

**Scope:** pure catalog, v1. No Vault/owned awareness.

## Context (current state)

- `/pokemon/$name` exists ([src/routes/pokemon/$name.tsx](../../../src/routes/pokemon/$name.tsx)),
  keyed by national dex number via `dexByName` + `getDexCardsFn`. No `/pokemon`
  index route exists, and nothing links to `/pokemon`.
- `/trainer` + `/energy` indexes are flat `CardListPage`s. The home "Browse by
  card type" shelf ([home-browse.tsx:86](../../../src/components/home/home-browse.tsx))
  links only Trainers + Energy.
- Corpus card shape ([corpus-types.ts](../../../src/store/corpus/corpus-types.ts)):
  carries `name`, `imageUrlSmall`, `rarity`, `types[]`, `supertype`,
  `nationalPokedexNumbers[]`. The dex numbers are how cards already map to species.
- Reusable parts already in the repo:
  - `getCardAccent(types)` / `getTypeColor` — [card-colors.ts](../../../src/utils/card-colors.ts)
    (TCG energy-type → hex). Reuse for the tile glow; **do not add a new map**.
  - `VirtuosoGrid` + `listClassName="grid grid-cols-2 gap-3 m-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"`
    pattern — [card-grid-island.tsx:238](../../../src/components/islands/card-grid-island.tsx).
  - `dexByName` / `nameByDex` — [pokemon-dex.ts](../../../src/server/pokemon-dex.ts).
  - `getPokemonListCached()` (PokéAPI national-dex list, `{name, url}`) +
    `MAX_DEX` — [corpus-server.ts](../../../src/server/corpus-server.ts) /
    [card-data-fetch.ts](../../../src/server/card-data-fetch.ts).

## Design

### Data — one new server fn

`getPokedexFn()` in [corpus-server.ts](../../../src/server/corpus-server.ts):

1. `getPokemonListCached()` → derive `{ dex, name }` for ~1025 species
   (dex from the trailing id in each PokéAPI URL, as `pokemon-dex.ts` already does).
2. Single pass over the server-side corpus card list. For each card, for each
   `dex` in `card.nationalPokedexNumbers ?? []`: increment that species' `count`
   and tally `card.types?.[0]` in a per-species frequency map.
3. Emit one row per species **with `count >= 1`**:
   `{ dex: number; name: string; count: number; type: string | null }`,
   where `type` is the most-frequent first-type across that species' cards
   (ties → first seen). Sort ascending by `dex`.

Output is ~1000 light rows, static and cacheable (corpus is static in memory
server-side), same aggregation style as the existing `queryCorpusServer` paths.

**Shared client-safe module** `src/lib/pokedex.ts` (no server imports, so the
client can use it): the `PokedexRow` interface, the `spriteUrl(dex)` builder, the
`GENERATIONS` table (label + dex range), and a `generationOf(dex)` helper. The
server fn imports `PokedexRow` from here; the components import the rest.

### Sprite + color (client, no new data source)

- **Sprite URL:** `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`.
  Render with `image-rendering: pixelated` (crisp retro scale-up) and
  `loading="lazy"` so only on-screen tiles fetch.
- **Fallback:** `onError` swaps to a faint silhouette/`?` placeholder for any dex
  with no sprite (gaps/forms).
- **Glow color:** `getCardAccent(row.type ? [row.type] : [])` — reuse, no new map.

### Components (`src/components/pokedex/`)

- `species-tile.tsx` — one tile: pixel sprite over a type-colored radial glow,
  name, `#NNN` (mono, zero-padded), card-count chip. Matches the approved mockup.
  Wrapped in `Link to="/pokemon/$name"` `params:{ name: row.name }`
  `search: LIST_SEARCH_DEFAULTS`. Liquid-Glass tile styling (border-white/10,
  bg-white/[0.05], inset top highlight) per the design system.
- `pokedex-grid.tsx` — `VirtuosoGrid` over the filtered rows, reusing the
  card-grid `listClassName` grid pattern. Requires a definite-height flex parent
  (known Virtuoso gotcha). Exposes a ref so the generation bar can
  `scrollToIndex`. Renders an empty state when the filter matches nothing.
- `generation-bar.tsx` — Gen 1–9 jump pills with their dex ranges
  (1–151, 152–251, 252–386, 387–493, 494–649, 650–721, 722–809, 810–905,
  906–1025). Click → scroll the grid to the first visible row at/after that
  generation's start dex. A generation with no visible rows (e.g. filtered out)
  is disabled.

### Route

`src/routes/pokemon/index.tsx`:

- `loader` → `getPokedexFn()` (SSR'd).
- Local `query` state for the search box: live client-side filter over the
  loaded rows by name (case-insensitive substring) or dex number. **Not** a URL
  search param in v1.
- Renders: search input, generation bar, `pokedex-grid`, inside a
  `max-w-7xl … h-full flex flex-col` shell (mirrors `/pokemon/$name`'s shell so
  the height chain feeds Virtuoso).
- `head`: `title` "Pokédex · every Pokémon TCG card by species", a description
  with the species count, and `og:title`.

### Wire-in

Add a **Pokémon** pill as the lead item in the "Browse by card type" shelf in
[home-browse.tsx:86](../../../src/components/home/home-browse.tsx) (before
Trainers + Energy), `Link to="/pokemon"`.

## Error handling / edge cases

- Empty corpus → loader returns `[]`; grid shows a "catalog loading" empty state
  rather than a blank screen.
- Sprite 404 → silhouette fallback (above).
- Search no-match → "No species match" empty row.
- Species in the dex list with zero cards never appear (filtered at aggregation).
- A card with multiple `nationalPokedexNumbers` (multi-species cards) counts
  toward each listed species — intended.

## Testing (Bun + happy-dom)

Pre-seed the corpus per the no-network rule
(`useCorpusRuntime.setState({ index: buildIndex([...]) })`) in any test that
renders the grid. Cover:

- `getPokedexFn` aggregation: per-species count, most-frequent type tally,
  `count >= 1` filter (zero-card species excluded), ascending dex sort,
  multi-dex card counted twice.
- `species-tile`: renders sprite URL for the dex, name, zero-padded `#NNN`,
  count; href resolves to `/pokemon/$name` with the species name; `onError`
  fallback swaps the image.
- search filters rows by name and by dex number; no-match empty state.
- generation bar: pill click triggers `scrollToIndex`; empty generation disabled.

## Deferred (YAGNI)

- Vault/owned overlay (caught state, owned/total completion).
- URL-param search state (shareable/back-button).
- Type / generation *filters* (v1 ships search + jump only).
- Sort-by-count or alphabetical sort toggle.
- Richer artwork (official-artwork / HOME renders) — pixel sprite chosen; swap is
  a one-line URL-folder change if revisited.

# Phase 1 / #4 — Cross-Mode Linking

**Date:** 2026-05-03
**Status:** Implemented
**Roadmap phase:** 1 of 5 (depends on Phase 0's `<HoloCard hoverOverlay={…} />` hook)

## Context

The viewer has two browse axes — By-Set (`/`) and By-Pokémon (`/pokemon`) — which today don't cross-reference. A user looking at a Pikachu card in Vivid Voltage cannot ask "what other sets is this Pikachu in?" without manually retyping the search in the other tab. Phase 0 deliberately built `HoloCard.hoverOverlay` as a slot for exactly this kind of affordance; this phase fills it in.

The work also takes the opportunity to move page selection state from localStorage to URL search params — a foundation for Phase 2's per-card deep links (#2) and a prerequisite for browser back/forward to behave correctly when crossing between modes.

## Goals

1. From a card in the By-Set view, link to the By-Pokémon view filtered to that pokédex number.
2. From a card in the By-Pokémon view, link to the By-Set view selecting that card's set.
3. Make navigation deterministic and shareable: page selection lives in the URL (`/?setId=…` and `/pokemon?dex=…`), not localStorage.
4. Browser back/forward returns to the previous view at the previous scroll position.
5. Cards featuring multiple Pokémon (e.g. "Reshiram & Charizard GX") show one link per Pokémon.
6. Cards without a pokédex number (Trainers, Energies) show no overlay.

## Non-goals

- Per-card permalinks (`/card/:id`) — that's Phase 2's #2.
- Scrolling the destination grid to the originating card — deferred to a later phase.
- Animated transitions between modes.
- Sharable links carrying scroll position.
- A separate "back to <previous Pokémon>" affordance on the destination — `<ScrollRestoration />` + browser back is the recovery path.

## Approach

### URL state migration

Today, `selectedSetId` and `selectedPokedexNumber` live in the Zustand store and are mirrored to localStorage via `partialize`. After this phase, the URL is the source of truth:

- `/?setId=swsh12pt5` — By-Set view, Crown Zenith selected
- `/pokemon?dex=25` — By-Pokémon view, Pikachu selected

A small hook in `src/hooks/use-url-selection.ts` centralises the read/write:

```ts
export function useSetIdParam(): [string | null, (id: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const setId = params.get("setId");
  const setSetId = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("setId", id); else next.delete("setId");
    setParams(next);
  };
  return [setId, setSetId];
}

export function usePokedexParam(): [number | null, (n: number | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("dex");
  const dex = raw === null ? null : Number.parseInt(raw, 10);
  const set = (n: number | null) => {
    const next = new URLSearchParams(params);
    if (n !== null && Number.isFinite(n)) next.set("dex", String(n));
    else next.delete("dex");
    setParams(next);
  };
  return [Number.isFinite(dex) ? dex : null, set];
}
```

`SetsPage` and `PokemonPage` switch from Zustand selectors to these hooks. The Zustand `UISlice` shrinks to nothing meaningful and is removed; the store keeps only `ApiCacheSlice` (sets list + pokémon list cache). The `partialize` config in `store/index.ts` drops `selectedSetId` and `selectedPokedexNumber`.

The existing default-selection logic in `SetsPage` (if no selection, fall back to the newest set) becomes a `useEffect` that calls `setSetId(sets[0].id)` once `sets` data lands and `setId` is null.

### Data shape changes

Two fields added to `HoloCardData` and the local `PokemonApiCard` interface in `src/api.ts`:

```ts
export interface HoloCardData {
  id: string;
  imageUrl: string;
  name: string;
  rarity?: string;
  subtypes?: string[];
  supertype?: string;
  setId: string;
  setName: string;                       // NEW — required (always in API response)
  cardNumber: string;
  nationalPokedexNumbers?: number[];     // NEW — optional (Trainers/Energies)
}
```

The API `select=` parameter expands to include `nationalPokedexNumbers` (the API already supports filtering by it via `q=nationalPokedexNumbers:25`, but our select didn't fetch it back per card). `set.name` is already in the response — we just stop dropping it in `apiCardToProps`.

### `<CrossLinkOverlay>` component

New module at `src/components/cross-link-overlay/`:

```
cross-link-overlay/
├── index.ts
├── cross-link-overlay.tsx
├── cross-link-overlay.test.tsx
└── cross-link-overlay.css
```

API:

```tsx
interface CrossLinkOverlayProps {
  links: Array<{ label: string; to: string }>;
}
export function CrossLinkOverlay({ links }: CrossLinkOverlayProps) { /* … */ }
```

Visual: a small dark pill in the card's top-right (already positioned by `holo-card.css`'s `.holo-card-overlay` rule), backdrop-blur, semi-transparent. Each link is a react-router `<Link>` rendered as a row with a tiny `→` glyph and the label. Multiple links stack vertically. Returns `null` when `links` is empty so a parent can pass `[]` without conditionally rendering.

### `<CardGrid>` overlay slot

`CardGrid` accepts a new `renderOverlay?: (card: HoloCardData) => React.ReactNode` prop and passes the result to `HoloCard.hoverOverlay`:

```tsx
interface CardGridProps {
  setId: string | null;
  cards: HoloCardData[];
  onEndReached: (setId: string) => void;
  renderOverlay?: (card: HoloCardData) => React.ReactNode;
}

// itemContent:
<HoloCard
  imageUrl={card.imageUrl}
  /* ...other props... */
  hoverOverlay={renderOverlay?.(card)}
  style={{ width: 300 }}
/>
```

### Page-specific overlay rendering

**`SetsPage`** maps each card's `nationalPokedexNumbers` to one link per Pokémon. Empty/undefined arrays return `null`:

```tsx
renderOverlay={(card) => {
  const dexNums = card.nationalPokedexNumbers ?? [];
  if (dexNums.length === 0) return null;
  const links = dexNums.map((n) => ({
    label: `View all ${pokemonName(n) ?? `#${n}`}`,
    to: `/pokemon?dex=${n}`,
  }));
  return <CrossLinkOverlay links={links} />;
}}
```

**`PokemonPage`** renders one "Go to <Set Name>" link per card:

```tsx
renderOverlay={(card) => (
  <CrossLinkOverlay
    links={[{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` }]}
  />
)}
```

### Pokémon-name lookup

For the SetsPage overlay's "View all Pikachu" label, we need pokédex# → name. The existing `pokemonList` slice (loaded from pokeapi.co at startup) is keyed by index. A pure selector helper alongside the slice:

```ts
// store/api-cache-slice.ts (or an adjacent helper file)
export function pokemonNameByDex(
  pokemonList: PokemonListEntry[] | null,
  pokedexNumber: number,
): string | null {
  if (!pokemonList || pokedexNumber < 1 || pokedexNumber > pokemonList.length)
    return null;
  return displayName(pokemonList[pokedexNumber - 1].name);
}
```

(The existing `displayName` helper in `pokemon-filter.tsx` is hoisted to a shared util for reuse.)

If `pokemonList` hasn't loaded yet at first paint, the overlay shows `#25` instead of "Pikachu". The link still works; the visual upgrades once data lands. Acceptable trade-off — cached after first session anyway.

### `<ScrollRestoration />`

Added once in `app.tsx`, just before `<Routes>`. React Router 7 ships this; works with `<Routes>` from the same package.

### Migration steps (for the implementation plan)

1. Add `nationalPokedexNumbers` and `setName` to types and `apiCardToProps`; expand the API `select=`.
2. Hoist `displayName` helper, add `pokemonNameByDex` selector helper.
3. Add `useSetIdParam` and `usePokedexParam` hooks.
4. Migrate `SetsPage` and `PokemonPage` to use the URL hooks; remove default-selection effect and replace with URL-driven equivalent.
5. Drop `selectedSetId` / `selectedPokedexNumber` from `UISlice` and `partialize` (the slice may be removed entirely if no other fields remain).
6. Build `<CrossLinkOverlay>` component (TDD).
7. Add `renderOverlay` prop to `<CardGrid>`.
8. Wire SetsPage and PokemonPage to render overlays.
9. Add `<ScrollRestoration />` to `app.tsx`.
10. Run all existing 17 tests + new tests, fix any that broke from the URL migration.

## Verification

- All 17 existing Phase-0 tests continue to pass.
- New unit tests:
  - `useSetIdParam` and `usePokedexParam` — read existing param, write a new param, clear via `null`, ignore non-numeric `dex` values.
  - `CrossLinkOverlay` — renders one link, renders multiple stacked links, renders `null` when given an empty array, links are real `<Link>` elements with the right `to`.
  - `pokemonNameByDex` — returns name for known dex, returns `null` for out-of-range, returns `null` for null list.
  - `SetsPage` overlay — returns `null` for cards with no `nationalPokedexNumbers` (Trainer/Energy fixture); returns multi-link overlay for a multi-Pokémon fixture.
  - `PokemonPage` overlay — single "Go to <Set Name>" link.
- Manual smoke:
  - Loading `/?setId=swsh12pt5` directly into the URL bar selects Crown Zenith.
  - Loading `/pokemon?dex=25` directly selects Pikachu.
  - Click a Pikachu card from a set → URL becomes `/pokemon?dex=25`, view switches.
  - Click a card on the Pokémon view → URL becomes `/?setId=…`, view switches to that set.
  - Browser back from either restores the previous URL and scroll position.
  - A "Pikachu & Zekrom GX" card (Sword & Shield Black Star Promos has one) shows two stacked links.
  - A Trainer card (e.g. "Boss's Orders") has no overlay on hover.
- Lint, typecheck, build all clean.

## Open questions

None at design time. Ambiguities to resolve during implementation:

- The Zustand `UISlice` may have additional fields by the time we implement (not currently). If so, only the two URL-migrated fields are removed; the slice itself stays.
- React Router 7's `<ScrollRestoration />` interacts with `react-virtuoso`'s own scroll management. If a manual smoke test reveals scroll-restoration not working with the virtualized grid, the implementer should disable scroll restoration for the grid container (Virtuoso provides hooks for this) rather than abandoning the feature.

## Risks

- **localStorage migration:** existing users have `selectedSetId` / `selectedPokedexNumber` persisted from Phase 0. After this change those fields are ignored. No data loss — the URL takes over. `STORAGE_VERSION` in `store/index.ts` is bumped to drop stale persisted state cleanly.
- **`<ScrollRestoration />` + virtuoso:** as noted in open questions; mitigated by smoke testing during implementation.
- **API rate limiting:** adding `nationalPokedexNumbers` to the select doesn't change request count or response size meaningfully (a few extra bytes per card).

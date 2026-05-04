# Phase 2 / #8 — Pokémon Lineage Timeline View

**Date:** 2026-05-03
**Status:** Approved (design)
**Roadmap phase:** 2 of 5 (second feature in the phase; depends on Phase 2 #2a's `/card/:id` route for click-through, and on Phase 1 #4–#5's filter and URL state)

## Context

The `/pokemon?dex=N` page (Phase 1 #4) lists all cards of a Pokémon across every set, ordered chronologically by `set.releaseDate,number`. The data is already a chronological "every printing" list — what's missing is *presentation* that turns that flat sequence into a recognizable timeline a user can read at a glance.

This phase adds a "Timeline" view mode to the same page. Cards are grouped by their TCG era (`set.series`) and rendered as era-by-era sections with header + year range + card count. The user toggles between grid and timeline via a URL param (`view=timeline`). Same fetch infrastructure, same filters, same click-to-focus behavior — just a different layout.

## Goals

1. From `/pokemon?dex=N`, users can toggle to a timeline view that groups cards by TCG era (`set.series`).
2. Each era section shows the era name, computed year range (e.g. "2020 — 2022"), and card count.
3. Eras are sorted oldest → newest by the earliest `setReleaseDate` in each group.
4. The view mode is URL-backed (`?view=timeline`) and shareable. Default is `grid` and isn't serialized to URL.
5. All existing functionality on `/pokemon` works in timeline mode: filters apply, click → `/card/:id` focus view, hover overlay shows cross-mode links.
6. Pagination works in timeline mode via a "Load more" button (no virtualization in this view; card counts per Pokémon are typically 50–200, fine for plain DOM).

## Non-goals

- **Per-card lineage** ("show me reprints of THIS specific Charizard card"). The pokemontcg.io API doesn't model reprint relationships; detecting them would require heuristic matching on name + attacks + flavor. Distinct feature; future spec if anyone wants it.
- **Horizontal carousel layout** per era. Considered as a "more visually striking" alternative; deferred. Vertical grid is simpler and works at all screen widths.
- **Era-themed visual design** (per-era backgrounds, color schemes evoking Base/EX/SwSh aesthetics). Cosmetic polish; not load-bearing.
- **Era jump navigation** (sticky mini-map / scrubber to jump between eras). Useful for very long timelines; skip for v1, add later if needed.
- **Sticky era headers**. One-line CSS addition that could come as a follow-up.
- **Set logos** in era headers. Picking which set's logo represents an era is its own design call.
- **Replacing the grid view**. Both modes coexist; `grid` is the default.

## Approach

### URL state

A single new URL param: `view`. Allowed values: `"grid"` (default, omitted from URL) and `"timeline"`.

A new hook in `src/hooks/use-url-selection.ts`:

```ts
type ViewMode = "grid" | "timeline";
type SetView = (mode: ViewMode, opts?: UpdateOptions) => void;

export function useViewModeParam(): [ViewMode, SetView] {
	const [params, setParams] = useSearchParams();
	const raw = params.get("view");
	const mode: ViewMode = raw === "timeline" ? "timeline" : "grid";
	const setMode: SetView = (next, opts) => {
		const np = new URLSearchParams(params);
		if (next === "timeline") np.set("view", "timeline");
		else np.delete("view");
		setParams(np, opts?.replace ? { replace: true } : undefined);
	};
	return [mode, setMode];
}
```

### Data shape extension

`HoloCardData` gains two fields. Both are populated from the existing API response (`set.series` and `set.releaseDate` are already returned — `apiCardToProps` just stops dropping them):

```ts
export interface HoloCardData {
	// ...existing fields...
	setSeries: string;          // e.g. "Sword & Shield"
	setReleaseDate?: string;    // ISO date, e.g. "2020-02-07"
}
```

`apiCardToProps` updated to:

```ts
function apiCardToProps(card: PokemonApiCard): HoloCardData {
	return {
		// ...existing mappings...
		setSeries: card.set.series,
		setReleaseDate: card.set.releaseDate,
	};
}
```

The `PokemonApiCard` interface in `src/api.ts` gains the `releaseDate?: string` field on its `set` object (`series` is already there).

This is purely additive — no existing consumers break. `setSeries` is required (always present); `setReleaseDate` is optional (some older sets in the API may have null/missing dates).

### `useCards` extension

`src/hooks/use-cards.ts` exposes `hasMore` so the timeline's "Load more" button knows when to render. Currently the hook returns `{ cards, loading, loadMore }`; it gains a `hasMore: boolean` derived from `cards.length < totalCount` (where `totalCount` is already tracked internally per the cache entry).

```ts
interface UseCardsResult {
	cards: HoloCardData[];
	loading: boolean;
	loadMore: (key: string) => void;
	hasMore: boolean;          // NEW
}
```

The grid view doesn't need to use `hasMore` (Virtuoso handles its own end-detection), but it's harmless to expose.

### `<PokemonTimeline>` component

New module at `src/components/pokemon-timeline/`:

```
pokemon-timeline/
├── index.ts
├── pokemon-timeline.tsx
├── pokemon-timeline.test.tsx
└── pokemon-timeline.css
```

API:

```tsx
interface PokemonTimelineProps {
	cards: HoloCardData[];
	loading: boolean;
	hasMore: boolean;
	onLoadMore: () => void;
	renderOverlay?: (card: HoloCardData) => React.ReactNode;
}
```

Behavior:

- **Group cards by `setSeries`.** Cards missing or empty series go into an "Other" bucket (defensive — rare in practice).
- **Sort eras** by the earliest `setReleaseDate` among each group's cards (ascending — oldest first). Cards within an era keep the API's existing chronological order (`set.releaseDate,number`).
- **Render** each era as a `<section>` with:
  - **Header**: era name, year range computed from min/max `setReleaseDate` in the group ("2020 — 2022", or just "2020" if all cards share a year), and a card count ("47 cards").
  - **Body**: a flex/wrap layout of `<HoloCard>` instances at the standard grid size (~300px). No virtualization — most Pokémon have 50–200 cards; flat DOM is fine.
- **Click handler:** each `<HoloCard>` has `onClick` wired via `useNavigate()` to navigate to `/card/:id` (matching the grid's behavior from Phase 2 #2a). The `e.defaultPrevented` guard from the Phase 2 #2a fix is preserved so hover overlay links still work.
- **Hover overlay:** `renderOverlay?.(card)` passed through unchanged.
- **Pagination:** at the bottom, when `hasMore && !loading`, render a "Load more" button that calls `onLoadMore`. When `loading`, show a small spinner pill in the same position.
- **Empty filtered state:** if `cards` is empty array, render a small "No cards match these filters" message.

### `<ViewModeToggle>` UI

Small inline component (or function in `pokemon-page.tsx`). Renders two pill buttons: "Grid" and "Timeline". Active mode is highlighted (using styling consistent with the existing `FilterChip.active`). Disabled when `pokedexNumber === null` (no Pokémon selected). Placement: right-aligned in the page header area, alongside or below the existing "Filter by Pokémon" caption.

### `pokemon-page.tsx` integration

The page reads `useViewModeParam()` and branches on the mode:

```tsx
const [view, setView] = useViewModeParam();
const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);

return (
	<>
		<header className="header">
			<h1>Pokémon TCG Holo Playground</h1>
			<div className="set-meta">
				<div>
					<div className="set-name">Filter by Pokémon</div>
					<div className="set-sub">{ /* existing caption */ }</div>
				</div>
				<ViewModeToggle
					value={view}
					onChange={setView}
					disabled={pokedexNumber === null}
				/>
			</div>
		</header>
		<PokemonFilter value={pokedexNumber} onChange={setPokedexNumber} />
		<FilterChipRow ... />
		{view === "grid" ? (
			<CardGrid
				setId={cacheKey}
				cards={cards}
				onEndReached={loadMore}
				renderOverlay={renderOverlay}
			/>
		) : (
			<PokemonTimeline
				cards={cards}
				loading={loading}
				hasMore={hasMore}
				onLoadMore={() => { if (cacheKey) loadMore(cacheKey); }}
				renderOverlay={renderOverlay}
			/>
		)}
		{loading && <div className="loading-pill">Loading…</div>}
	</>
);
```

The grid path is unchanged from today. The timeline path uses the same `cards` array, `loading` flag, and `loadMore` function — just renders differently.

### Pagination semantics

The existing `useCards` paginates 20 cards per fetch. In timeline mode:
- The user clicks "Load more" → `loadMore(cacheKey)` fires → another page of 20 cards arrives → eras update.
- New cards may belong to existing eras (extending those era sections) or new eras (new sections appear, sorted into the right chronological position).
- Filters change the cache key, which invalidates and re-fetches. Timeline re-renders with the filtered card set.

### Migration steps (for the implementation plan)

1. Extend `HoloCardData` with `setSeries` and `setReleaseDate`. Update `apiCardToProps` mapper. Update `PokemonApiCard` interface to include `set.releaseDate`.
2. Add `useViewModeParam()` hook with tests.
3. Add `hasMore` to `useCards` return shape.
4. Build `<PokemonTimeline>` component with TDD (fixtures with cards across multiple eras + filtered-to-empty + load-more button states).
5. Build `<ViewModeToggle>` (inline in `pokemon-page.tsx` is fine if it stays small).
6. Wire `pokemon-page.tsx` to read `useViewModeParam()` and branch.
7. Run all checks; verify the grid view still works identically.

## Verification

- All existing 82 tests pass after the changes.
- New unit tests:
  - `useViewModeParam` — default returns `"grid"` when param absent; returns `"timeline"` when `?view=timeline`; setting `"timeline"` writes the param; setting `"grid"` deletes it.
  - `<PokemonTimeline>` — groups cards by `setSeries`; sorts eras by earliest `setReleaseDate`; renders era headers with name + year range + count; renders "Load more" button when `hasMore`; calls `onLoadMore` on click; shows empty-state message when `cards` is empty.
  - `apiCardToProps` smoke test — confirms `setSeries` and `setReleaseDate` propagate from a fixture.
- Manual smoke:
  - `/pokemon?dex=25`: load Pikachu (grid view). Toggle to Timeline → URL becomes `/pokemon?dex=25&view=timeline`. Page renders era sections.
  - Era headers show "Sword & Shield 2020 — 2022 · 12 cards" or similar.
  - Click "Load more" → more cards arrive → eras grow or new ones appear.
  - Apply a rarity filter (e.g., Rare Holo VMAX) → some eras lose their content and disappear from the timeline.
  - Click a card in timeline → focus view loads at `/card/:id`.
  - Hover a card → cross-link overlay appears (Phase 1 #4 still works).
  - Toggle back to Grid → URL drops `view` param, grid renders.
  - Direct URL `/pokemon?dex=25&view=timeline` loads timeline immediately (no grid flash).
- Lint, typecheck, build all clean.

## Open questions

None at design time. Ambiguities to resolve during implementation:

- The exact placement and styling of `<ViewModeToggle>` — the design says "alongside or below the Filter by Pokémon caption". Implementer can adjust based on layout fit.
- Whether to add sticky era headers (`position: sticky`) for nicer scrolling. Cheap to add; not blocking. Implementer's call during the CSS pass.

## Risks

- **Card counts in popular Pokémon.** Pikachu has 200+ cards; loading them all (even progressively) plus rendering in plain DOM may produce a long page. Mitigation: timeline only renders what's currently loaded — the "Load more" button gives the user explicit control. If rendering performance becomes an issue, switch to `<GroupedVirtuoso>` from react-virtuoso (1D virtualization with group headers — same library we already use). Not in v1 scope.
- **Eras with sparse `setReleaseDate`.** Some older sets in the API may have null/missing dates. Mitigation: when sorting eras, fall back to the era's name (alphabetic) for groups with no dates. Defensive in the era-grouping code.
- **Filter cache invalidation.** Filtering changes the cache key, which means switching to timeline view with active filters refetches from page 1. Already-loaded "all rarities" cards aren't reused. Acceptable — same behavior as the grid view today; cache misses on filter changes are expected.
- **`hasMore` derivation.** Adding it to `useCards` requires reading `cards.length < totalCount` for the current cache entry. Need to expose `totalCount` either alongside cards in the cache or compute `hasMore` directly inside the hook. Implementer chooses the cleaner path during implementation.

# Phase 3 / #1 — Collection / Binder

**Date:** 2026-05-03
**Status:** Implemented
**Roadmap phase:** 3 of 5 (first feature in the phase; depends on Phase 0 HoloCard, Phase 1 #4/#5 URL state + filters, Phase 2 #2a focus view, Phase 2 #8 timeline view)

## Context

The viewer ships rich card browsing across `/` (set view), `/pokemon?dex=N` (every-printing view), and `/card/:id` (focus view). Users can hover for cross-mode links, filter by Phase 1 #5 advanced filters, and toggle to a Phase 2 #8 era timeline. What's missing is a way for the user to mark cards they own and revisit them later — a personal binder.

Phase 3 #1 adds this. A small `<CollectionToggle>` button on each card lets the user add/remove. A new `/collection` route renders the user's binder in grid (default) or timeline mode, reusing the Phase 2 #8 era grouping.

The implementation also lays groundwork for Phase 5 (PWA + IndexedDB): full card snapshots are persisted at add time, so the binder is browsable offline once Phase 5 adds the service worker.

## Goals

1. **Add/remove flow that fits beside existing UI.** No layout reflow on grids. Toggle lives in the existing `hoverOverlay` slot beside `<CrossLinkOverlay>`. Focus view (`/card/:id`) gets a prominent dedicated button.
2. **Owned-state indicator on every card render.** Visual signal (border glow + corner check) so the user can see at a glance which cards they have, regardless of view.
3. **`/collection` route that reuses Phase 2 #8.** Grid + timeline view modes both work, via `useViewModeParam` + `<PokemonTimeline>`.
4. **Persist across reloads.** Existing Zustand `persist` middleware. Bumped storage version with additive migration so existing API-cache users don't lose data.
5. **Phase 5 foundation.** Persist full `HoloCardData` snapshots, not just IDs, so the binder is offline-browseable once a service worker arrives.

## Non-goals (deferred)

- Export / import. Phase 5 handles portability via IndexedDB + PWA backup.
- Multi-device sync. localStorage only in v1; Phase 5 sync.
- Statistics dashboard (era breakdown chart, completion % by set).
- In-collection filtering by rarity/type/etc.
- Quantity controls (playset tracking). Storage supports it; v1 UI is binary toggle.
- Bulk operations (clear all, select multiple).
- Keyboard shortcut for add/remove.

## Architecture

### Storage layer

`src/store/collection-slice.ts` is a new Zustand slice composed alongside the existing `ApiCacheSlice` via the established `StateCreator` pattern in `src/store/index.ts`.

```ts
export interface OwnedCard {
	card: HoloCardData;        // full snapshot — enables offline browse later
	count: number;             // always 1 in v1 UI; field exists for future
	addedAt: number;           // Date.now() at add — for sort-by-recent later
}

export interface CollectionSlice {
	owned: Record<string, OwnedCard>;
	addToCollection: (card: HoloCardData) => void;
	removeFromCollection: (cardId: string) => void;
	clearCollection: () => void;
}
```

Actions are idempotent: `addToCollection` when the card is already present is a no-op (does not bump count or change `addedAt`); `removeFromCollection` on an absent id is a no-op. Reasoning: the UI is a binary toggle, and idempotency avoids needing to read state before writing.

Selectors used by consumers:
- `useStore(s => !!s.owned[cardId])` — boolean owned-indicator
- `useStore(s => Object.keys(s.owned).length)` — unique count
- `useStore(s => Object.values(s.owned).reduce((n, o) => n + o.count, 0))` — total copies
- `useStore(s => Object.values(s.owned).map(o => o.card))` — collection page card list

### Persistence

`src/store/index.ts` is updated:
- `STORAGE_VERSION` bumps from 2 to 3.
- The `persist` config gains a `migrate(persisted, fromVersion)` function that, for `fromVersion < 3`, returns the persisted object with `owned: {}` added. No data dropped.
- `partialize` adds `owned` to the mirrored fields.

### UI: hover-overlay integration

`<CollectionToggle>` is a small button rendered in the same overlay slot that `<CrossLinkOverlay>` already uses. Callers compose them together in their `renderOverlay` callback:

```tsx
function renderOverlay(card: HoloCardData) {
	return (
		<>
			<CrossLinkOverlay links={[{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` }]} />
			<CollectionToggle card={card} />
		</>
	);
}
```

`<CollectionToggle>` reads `owned[card.id]` from the store. Renders "+" when absent; "✓" when present. Click toggles. Click handler stops propagation (matches the Phase 2 #2a pattern: `e.preventDefault()` so the card-body click doesn't fire navigate to `/card/:id`).

### UI: focus view button

`/card/:id` does not have a hover overlay (the card is shown standalone). Add a prominent `<button>` near the card header that says "Add to collection" / "In your collection ✓ — Remove". Stretches across the action row. Same store hook as the small toggle.

### UI: owned indicator

`<HoloCard>` gains an `owned?: boolean` prop (default `false`). When `true`:
- Adds `holo-card--owned` class for a subtle green outer glow / border tint.
- Adds a small ✓ corner badge (absolute-positioned).

All consumers of `<HoloCard>` (set page, pokemon page, timeline, focus view) read the store and pass `owned={!!owned[card.id]}`.

### New page: `/collection`

Route registered in `src/main.tsx`:

```tsx
{ path: "collection", element: <CollectionPage /> }
```

Implementation in `src/pages/collection-page.tsx`:

```tsx
export function CollectionPage() {
	const [view, setView] = useViewModeParam();
	const owned = useStore(s => s.owned);
	const cards = Object.values(owned).map(o => o.card);
	const unique = cards.length;
	const copies = Object.values(owned).reduce((n, o) => n + o.count, 0);

	return (
		<>
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Your Collection</div>
						<div className="set-sub">
							{unique === 0
								? "No cards yet — tap + on any card to add it"
								: `${copies} copies · ${unique} unique`}
						</div>
					</div>
					<ViewModeToggle value={view} onChange={setView} disabled={unique === 0} />
				</div>
			</header>
			{view === "grid" ? (
				<CardGrid setId="collection" cards={cards} onEndReached={() => {}} renderOverlay={renderOverlay} />
			) : (
				<PokemonTimeline cards={cards} loading={false} hasMore={false} onLoadMore={() => {}} renderOverlay={renderOverlay} />
			)}
		</>
	);
}
```

Notes:
- No pagination needed (collection is local).
- `<ViewModeToggle>` extracted to its own component file (Phase 2 #8 left it inline in `pokemon-page.tsx` — promote to shared since two pages now use it).
- Empty state copy guides the user.
- `renderOverlay` on `/collection` includes `<CollectionToggle>` so the user can remove cards from the binder view; cross-link still goes to the set page.

### Nav

`src/root-layout.tsx` gets a third `NavLink` to `/collection`:

```tsx
<NavLink to="/collection" ...>Collection</NavLink>
```

## Risks

- **localStorage quota**: ~500 B × 1000 cards ≈ 500 KB. Browser quotas are 5–10 MB. Safe for v1. Phase 5 IndexedDB removes the ceiling.
- **Stale card snapshots**: if pokemontcg.io updates a card's metadata (rare), the user's persisted snapshot is stale until they re-add. Acceptable trade-off vs N refetches on every `/collection` mount.
- **Migration**: existing users on version 2 (post-Phase-1-#5) get `owned: {}` added in place. Test the migration path explicitly.
- **Click bubbling**: `<CollectionToggle>` lives inside the card overlay; clicks must not propagate to the card-body onClick (which navigates to `/card/:id`). Use `e.preventDefault()` and rely on the Phase 2 #2a `defaultPrevented` guard in both `<CardGrid>` and `<PokemonTimeline>`.
- **`<ViewModeToggle>` extraction**: small refactor of `pokemon-page.tsx` to import the component instead of defining it inline. Keep behavior identical; existing tests should still pass.

## Testing

New tests (~14, baseline 104 → 118):
- `collection-slice.test.ts`: 6 tests — addToCollection (new), addToCollection (idempotent), removeFromCollection (present), removeFromCollection (absent), clearCollection, total/unique selectors.
- `collection-toggle.test.tsx`: 4 tests — renders + state when absent, renders ✓ when present, click adds card, click removes card.
- `collection-page.test.tsx`: 4 tests — empty state, renders owned cards in grid view, renders owned cards in timeline view, header counts.

Existing tests:
- Phase 2 #8 page tests should continue passing after `<ViewModeToggle>` extraction (identical render output).
- Phase 1 #4/#5 cross-mode tests should continue passing — `<CollectionToggle>` is additive in the overlay.

Manual smoke test (Step in execution plan):
1. Add a card from `/` → ✓ indicator appears.
2. Navigate to `/collection` → card is there.
3. Toggle to timeline view in `/collection` → era grouping works.
4. Click card → `/card/:id` opens; "In your collection ✓" button present.
5. Click "Remove" → indicator clears, `/collection` empties.
6. Hard reload — collection persists.
7. Open devtools, check localStorage `pokemon-tcg-viewer` key — `owned` field present, snapshot complete.
8. Test migration: temporarily edit localStorage to version 2 (drop `owned` key), reload, verify no crash + `owned` reinitialized.

## Implementation order

1. Slice + tests (storage foundation).
2. Storage version bump + migration (composed into existing store).
3. `<HoloCard>` `owned` prop (visual indicator).
4. `<CollectionToggle>` component + tests.
5. Extract `<ViewModeToggle>` from `pokemon-page.tsx` to shared component.
6. `/collection` page + tests.
7. Wire add/remove into `/`, `/pokemon`, focus view, timeline.
8. Add nav link.
9. Smoke test + final verification.

## Out of scope alternates considered

- **Tri-state owned/wanted/not-owned**: rejected. Adds UI complexity for marginal value. Wishlist can be a future feature on top of the existing `owned` shape (`owned[id].count = 0` could mean wanted) if demanded.
- **Refetch-on-mount instead of snapshot**: rejected per the Phase 5 PWA prerequisite (need offline access).
- **Separate `/wishlist` route**: deferred; no demand signal yet.
- **Toast on add/remove**: deferred; the visual indicator is feedback enough.

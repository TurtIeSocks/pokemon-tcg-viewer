# Phase 4 / #3 — Pack Opening (Phase 4b)

**Date:** 2026-05-03
**Status:** Approved (design)
**Roadmap phase:** 4 of 5 (sibling to 4a tilt). Last feature in Phase 4.

## Context

The viewer ships rich card browsing (`/`, `/pokemon`, `/card/:id`, `/collection`), Phase 2 #8 timeline, Phase 3 #1 personal collection, Phase 4a device tilt. The remaining hook from the original brainstorming menu is the "open a booster pack" gameplay loop: pick a set, rip a virtual pack, watch ten holo cards reveal, optionally add favorites to the collection. This is the most "game-feel" feature in the roadmap — it turns the viewer into a low-stakes simulator.

The implementation is intentionally simple — no monetization, no daily-pack rate limits, no animation choreography beyond a fade-in. The goal is the holo wow + add-to-collection lever.

## Goals

1. **Pull 10 random cards from any set on demand**, weighted by rarity to mimic real booster odds (roughly 6 common / 3 uncommon / 1 rare).
2. **Reveal them in the holo grid**, full-shine via existing `<HoloCard size="focus">`.
3. **Let the user add favorites to their collection** via the existing `<CollectionToggle>` overlay.
4. **Allow infinite re-rolls of the same set** without refetching the API (cache the set's card list).
5. **Surface a "Rip pack" CTA on every set tile** on the existing `/` page so the entry point is one click from set browse.

## Non-goals (deferred)

- Card-by-card click-reveal animation. v1 reveals all 10 at once.
- 3D pack-ripping animation. v1 fades the closed pack out, fades cards in.
- Daily-pack limits, pack inventory, currency, or any economy layer.
- Pack-history (which packs you opened, when). Each pack is ephemeral.
- Custom pack composition (e.g. "all-holo packs"). Fixed odds for now.
- Cross-set packs.
- Seed-shareable packs (URL-encodable RNG seed).
- Tilt enabled by default on revealed cards. Tilt remains a focus-view feature.

## Architecture

### Storage: `pack-cards-slice.ts`

Parallels `api-cache-slice.ts`. Caches the full card list per set so re-rolling doesn't refetch.

```ts
export interface PackCardsSlice {
	packCards: Record<string, HoloCardData[]>;
	packCardsFetchedAt: Record<string, number>;
	packCardsLoading: Record<string, boolean>;
	loadPackCards: (setId: string) => Promise<void>;
}
```

Behavior:
- `loadPackCards(setId)`: bail if loading, bail if cache is fresh via existing `shouldRefetch` (new `kind: "packCards"`, 7-day TTL — sets rarely change), else `getCardsBySet(setId, 1, 250)` and store.
- Loading flag is per-set so concurrent loads of different sets don't block each other.

Composed into `useStore` alongside `ApiCacheSlice` and `CollectionSlice`. `STORAGE_VERSION` bumps `3 → 4` with additive migration: pre-Phase-4b state gets `packCards: {}` + `packCardsFetchedAt: {}` added.

### Pure: `roll-pack.ts`

```ts
export interface RollOptions {
	pool: HoloCardData[];
	rng?: () => number; // injectable for tests; default Math.random
	packSize?: number;  // default 10
}

export function rollPack({ pool, rng = Math.random, packSize = 10 }: RollOptions): HoloCardData[];
```

Algorithm:
1. Bucket the pool by rarity into `rares`, `uncommons`, `commons`.
   - **Rare**: rarity matches `/^Rare/i` AND is non-empty (covers "Rare", "Rare Holo", "Rare Holo VMAX", "Rare Ultra", etc.). Catch-all for the rare slot.
   - **Uncommon**: rarity === "Uncommon".
   - **Common**: rarity === "Common" OR rarity falsy/missing.
2. Pull `min(1, rares.length)` random rare without replacement.
3. Pull up to 3 uncommons. If `uncommons.length < 3`, top up from rares then commons.
4. Pull up to 6 commons. If `commons.length < 6`, top up from remaining uncommons then rares.
5. If the resulting pack has fewer than `packSize` cards (rare edge: tiny sets), repeat-pull from leftover pool until full, or accept smaller pack and warn.
6. Sample-without-replacement enforced — no within-pack duplicates.

The `rng` injection makes tests deterministic. Production uses `Math.random`.

### Component: `<BoosterPack>`

`src/components/booster-pack/booster-pack.tsx`. Visual closed-pack representation, built from existing set metadata — no new image assets.

Props:
```ts
interface BoosterPackProps {
	set: PokemonSet;
	onRip: () => void;
	ripped: boolean; // when true, animate fade-out
}
```

Rendered as a flex container:
- Background: vertical gradient (purple → magenta, vaguely "booster" looking).
- Set logo (`set.images.logo`) centered.
- Set symbol (`set.images.symbol`) corner badge.
- Bottom label: set name + "RIP TO OPEN".
- Click handler fires `onRip`.

When `ripped`: applies a class that fades out + scales down via CSS transition. After ~300ms, parent unmounts and shows cards.

Tests (2):
- Renders set name + RIP-TO-OPEN label.
- Click fires `onRip`.

### Page: `<PackPage>`

`/pack/:setId` route. Implementation:

```tsx
export function PackPage() {
	const { setId } = useParams();
	const set = useStore((s) => s.sets?.find((x) => x.id === setId));
	const pool = useStore((s) => s.packCards[setId!]);
	const loading = useStore((s) => s.packCardsLoading[setId!]);
	const loadPackCards = useStore((s) => s.loadPackCards);
	const [ripped, setRipped] = useState(false);
	const [pack, setPack] = useState<HoloCardData[] | null>(null);

	useEffect(() => {
		if (setId) loadPackCards(setId);
	}, [setId, loadPackCards]);

	const onRip = () => {
		if (!pool) return;
		setRipped(true);
		setTimeout(() => setPack(rollPack({ pool })), 320);
	};

	const onReroll = () => {
		setPack(null);
		setRipped(false);
		// next click on the booster will fire onRip again
	};

	if (!set) return <NotFoundShell />;
	return (
		<>
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Open a {set.name} pack</div>
						<div className="set-sub">
							{loading ? "Loading set…" : pack ? `10 cards revealed` : "Tap pack to rip"}
						</div>
					</div>
				</div>
			</header>
			{!pack ? (
				<BoosterPack set={set} ripped={ripped} onRip={onRip} />
			) : (
				<>
					<div className="pack-reveal-grid">
						{pack.map((card) => (
							<HoloCard
								key={card.id}
								imageUrl={card.imageUrl}
								name={card.name}
								rarity={card.rarity}
								setId={card.setId}
								cardNumber={card.cardNumber}
								owned={!!useStore.getState().owned[card.id]}
								hoverOverlay={
									<>
										<CrossLinkOverlay links={[{ label: `Go to ${set.name}`, to: `/?setId=${set.id}` }]} />
										<CollectionToggle card={card} />
									</>
								}
								size="focus"
								onClick={(e) => {
									if (e.defaultPrevented) return;
									navigate(`/card/${card.id}`);
								}}
							/>
						))}
					</div>
					<div className="pack-reroll">
						<button type="button" onClick={onReroll}>Open another pack</button>
					</div>
				</>
			)}
		</>
	);
}
```

Note: the `owned` prop in the JSX above uses `useStore.getState()` for the read because the pack array is held in component state and only re-renders on roll/reroll — using a selector subscription inside the map for every card would over-render. Acceptable trade-off: the badge won't update if the user adds via the toggle while still on the page; the badge state syncs on next page render.

**Revision: use a selector subscription** since the existing `<CollectionToggle>` already updates the store and the user would expect the badge to follow. Read `useStore((s) => s.owned)` once at the top of the component, derive `owned={!!ownedMap[card.id]}` per card. One subscription, normal re-render flow.

### Sets-page CTA

Modify `src/pages/sets-page.tsx`. The existing set tile shows name + meta. Add a small `<button>` "Rip pack" that navigates to `/pack/:setId`:

```tsx
<button
	type="button"
	className="rip-pack-button"
	onClick={(e) => {
		e.stopPropagation();
		navigate(`/pack/${set.id}`);
	}}
>
	Rip pack
</button>
```

`e.stopPropagation()` because the surrounding tile may have its own click handler (read sets-page.tsx to confirm; if it doesn't, the stopPropagation is harmless).

### Routes

`src/main.tsx` adds the new route:

```tsx
{ path: "pack/:setId", element: <PackPage /> },
```

No loader function — the page uses the existing Zustand cache (loads on mount via `useEffect`). Avoids the loader-error-boundary plumbing in this iteration.

### Nav

No new nav link. Packs are set-scoped; the entry point is the per-set CTA on `/`.

## Risks

- **API rate limit**: pokemontcg.io is permissive but unbounded re-rolling could trigger throttling. Mitigated by per-set cache — only the FIRST rip of a set hits the API.
- **Cache invalidation**: sets rarely add cards; 7-day TTL is conservative. If a card list grows mid-session, user re-rips will use stale data until TTL expires. Acceptable.
- **Empty sets / no rarity tier**: fallback in `rollPack` returns a random sample. Tested.
- **Pack reveal layout on mobile**: 10 cards in a CSS grid. On small viewports, `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))` makes them stack. No horizontal scroll required.
- **Migration**: existing v3 users get `packCards: {}` + `packCardsFetchedAt: {}` added. No data drop.
- **Click propagation on set tile**: the "Rip pack" button must not trigger whatever the tile's own click does (likely `setId` filter URL change). `e.stopPropagation()` per the JSX above.

## Testing

New tests (~12, baseline 127 → 139):

`pack-cards-slice.test.ts` (4 tests):
- starts with empty `packCards`, `packCardsFetchedAt`, `packCardsLoading`
- `loadPackCards(setId)` populates cache from fetch (mock `getCardsBySet`)
- `loadPackCards` is a no-op if cache is fresh
- `loadPackCards` is a no-op if currently loading the same setId

`roll-pack.test.ts` (4 tests):
- Returns 10 cards from a balanced pool with seeded RNG
- Rare slot picks 1 card matching `/^Rare/i`
- No within-pack duplicates
- Falls back to random when no rarity tiers exist

`booster-pack.test.tsx` (2 tests):
- Renders the set name and "Rip to open" label
- Click fires `onRip`

`pack-page.test.tsx` (2 tests):
- Renders the closed booster when no pack rolled yet
- Reveals 10 cards after rip

`tilt` and `collection` tests unaffected (baseline 127 → 139).

## Manual smoke test

1. Navigate to `/`. Hover any set tile. "Rip pack" button visible.
2. Click "Rip pack" on the Base set. URL becomes `/pack/base1`. Closed pack visual fills the page with set logo.
3. Click closed pack → fade-out (~300ms) → 10 cards fade in.
4. Each card shows the holo shine. Hover one → cross-link + collection toggle in overlay.
5. Click "+" on 2 cards → ✓ badges appear, /collection shows them.
6. Click "Open another pack" → 10 new random cards (likely overlap with the first roll if the set is small).
7. Click a card → `/card/:id` opens with focus view (existing behavior).
8. Browser back → returns to pack with the rolled cards still visible (component state preserved? Actually no, state resets on remount — acceptable; user can reroll).
9. Navigate to `/pack/<invalid-set-id>` → friendly "Set not found" screen.

## Implementation order

1. `pack-cards-slice.ts` + tests + compose into store + migration.
2. `roll-pack.ts` + tests (pure).
3. `<BoosterPack>` component + tests.
4. `<PackPage>` + tests + CSS.
5. Modify `<SetsPage>` add "Rip pack" button.
6. Register route + nav (none).
7. Final verification + browser smoke.

## Out of scope alternates considered

- **Click-each-to-reveal**: rejected as v1 complexity. Reserve for Phase 4b.1 polish round.
- **3D pack rip CSS**: rejected, animation budget too high.
- **Pack-history list** ("recent pulls"): rejected; ephemeral packs are the design intent.
- **All-holo packs / EX-era packs / cross-set packs**: rejected; one consistent simulator UX in v1.
- **Card flip on reveal**: rejected; the holo shine is already the wow.

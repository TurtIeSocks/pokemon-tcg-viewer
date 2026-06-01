# Parity Plan 13 — Timeline / View-Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the timeline (lineage) view and the grid↔timeline toggle on the search and pokemon pages — group cross-set results by era (series, chronological), toggled via a URL `view` param. Final parity plan.

**Architecture:** Restore the pure `group-cards-by-era.ts` (+ test) verbatim. Restore `PokemonTimeline` as a client island (drop the deleted `warmCard` prefetch; `react-router` `useNavigate` → TanStack `Link`). Add `view` to the shared list-search params + a `ViewModeToggle`. On search/pokemon pages, the `CardGridIsland` renders grid OR timeline based on `view`. The set page stays grid-only (a single set has no cross-era spread).

**Tech Stack:** restored `group-cards-by-era.ts` + `pokemon-timeline.css`, `HoloCard`, `CollectionToggle`, `@tanstack/react-router` `Link`, the shared `ListSearch`/`stripSearchParams` plumbing (Plan 09), Bun test.

---

## Context the implementer needs

- **`groupCardsByEra(cards): CardEraGroup[]`** (restore from `main`) — pure, groups by `setSeries`, sorts by earliest `setReleaseDate`, computes year-range labels. Imports only `HoloCardData`. Has a `main` test. **Depends on `card.setReleaseDate`** being populated.
- **`setReleaseDate` availability:** the timeline needs `setReleaseDate` on each card. The corpus cards (`makeCorpusFetcher` output) join set metadata via `useStore.getState().sets` → check whether the hydrated `HoloCardData` carries `setReleaseDate`. `corpus-engine.ts:70` `hydrate` sets `setReleaseDate: set?.releaseDate`. So corpus results HAVE it when the sets cache is populated. The SSR seed (from `fetchCardsByName`/`fetchCardsByPokedex`) — check `apiCardToProps`: it sets `setReleaseDate` from `card.set.releaseDate` (the select includes `set`). Confirm both paths populate it; if the seed lacks it, timeline still groups by series (yearLabel just empty) — acceptable.
- **`PokemonTimeline`** (restore from `main`) imports: `react-router` `useNavigate` (→ TanStack `Link`), `warmCard` from `../../pages/card-prefetch` (DELETED — drop the `onPrefetch`), `useStore` (exists), `HoloCard` (exists), `./group-cards-by-era` + `./pokemon-timeline.css` (restore). Rework to take a `cardHref` resolver like the grid island, and render `<Link>` instead of `navigate`.
- **`ViewMode`** type was in the deleted `use-url-selection` — define it in `lib/card-query.ts` (`"grid" | "timeline"`), add `view` to `ListSearch` + `LIST_SEARCH_DEFAULTS` (default `"grid"`) + `validateListSearch` + `listSearchToUrl`.
- **`CardGridIsland`** (Plan 09) — extend to accept a `view` and render the timeline island when `view==="timeline"` (the island already holds the full `cards` array + pagination).
- The **set page** keeps grid-only (single set = one era). Search + pokemon get the toggle.
- bun test + happy-dom.

---

## File structure

- `src/components/pokemon-timeline/group-cards-by-era.ts` — restore (+ test).
- `src/components/pokemon-timeline/pokemon-timeline.css` — restore.
- `src/components/islands/pokemon-timeline.tsx` — restore `PokemonTimeline`, reworked (Link, no warmCard).
- `src/components/islands/view-mode-toggle.tsx` — restore `ViewModeToggle`, repoint `ViewMode`.
- `src/lib/card-query.ts` — modify: add `ViewMode` + `view` to `ListSearch`.
- `src/lib/list-search.ts` — modify: `view` in defaults/validate/url codec.
- `src/components/islands/card-grid-island.tsx` — modify: render timeline when `view==="timeline"`.
- `src/routes/search.tsx` + `src/routes/pokemon/$name.tsx` — modify: add `ViewModeToggle`.

---

### Task 1: Restore `group-cards-by-era` (pure)

**Files:**
- Create: `src/components/pokemon-timeline/group-cards-by-era.ts` (from `main`)
- Test: `src/components/pokemon-timeline/group-cards-by-era.test.ts` (from `main`)

- [ ] **Step 1: Restore both.**

```bash
git show main:src/components/pokemon-timeline/group-cards-by-era.ts > src/components/pokemon-timeline/group-cards-by-era.ts
git show main:src/components/pokemon-timeline/group-cards-by-era.test.ts > src/components/pokemon-timeline/group-cards-by-era.test.ts
```

- [ ] **Step 2: Run** — `bun test src/components/pokemon-timeline/group-cards-by-era.test.ts`. Expected: pass (imports only `HoloCardData`). Fix any moved path.

- [ ] **Step 3: Commit**

```bash
git add src/components/pokemon-timeline/group-cards-by-era.ts src/components/pokemon-timeline/group-cards-by-era.test.ts
git commit -m "feat(timeline): restore era-grouping (pure)"
```

---

### Task 2: Add `view` to the shared search params

**Files:**
- Modify: `src/lib/card-query.ts`
- Modify: `src/lib/list-search.ts`

- [ ] **Step 1: Add `ViewMode` + `view` to `ListSearch`** in `card-query.ts`:
```ts
export type ViewMode = "grid" | "timeline";
```
Add `view: ViewMode;` to the `ListSearch` interface.

- [ ] **Step 2: Thread `view` through `list-search.ts`.** Add to `LIST_SEARCH_DEFAULTS`: `view: "grid"`. In `validateListSearch`: `view: search.view === "timeline" ? "timeline" : "grid"`. In `listSearchToUrl`: `if (s.view !== undefined) out.view = s.view === "timeline" ? "timeline" : undefined;`.

- [ ] **Step 3: Typecheck** — `bun run typecheck`. This will surface every place constructing a `ListSearch` literal (the test fixtures in `card-query.test.ts`, any `LIST_SEARCH_DEFAULTS` spread). Add `view: "grid"` to the `card-query.test.ts` `empty` fixture. Fix until 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card-query.ts src/lib/list-search.ts src/lib/card-query.test.ts
git commit -m "feat(timeline): add view mode to shared list-search params"
```

---

### Task 3: Restore `ViewModeToggle` island

**Files:**
- Create: `src/components/islands/view-mode-toggle.tsx`

- [ ] **Step 1: Restore from `main`, repoint the `ViewMode` import.**

```bash
git show main:src/components/view-mode-toggle/view-mode-toggle.tsx > src/components/islands/view-mode-toggle.tsx
```
Edit line 1: `import type { ViewMode } from "../../hooks/use-url-selection";` → `import type { ViewMode } from "../../lib/card-query";`.

- [ ] **Step 2: Typecheck** — `bun run typecheck` → 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/view-mode-toggle.tsx
git commit -m "feat(timeline): restore grid/timeline view toggle"
```

---

### Task 4: Restore `PokemonTimeline` island (Link, no warmCard)

**Files:**
- Create: `src/components/islands/pokemon-timeline.tsx`
- Create: `src/components/pokemon-timeline/pokemon-timeline.css` (from `main`)

- [ ] **Step 1: Restore the CSS.**

```bash
git show main:src/components/pokemon-timeline/pokemon-timeline.css > src/components/pokemon-timeline/pokemon-timeline.css
```

- [ ] **Step 2: Implement the reworked island** `src/components/islands/pokemon-timeline.tsx`. Based on `main`'s `PokemonTimeline` but: `Link` instead of `navigate`, no `warmCard`, takes `cardHref` like the grid.

```tsx
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useStore } from "../../store";
import { CollectionToggle } from "../collection-toggle";
import { HoloCard, type HoloCardData } from "../holo-card";
import { groupCardsByEra } from "../pokemon-timeline/group-cards-by-era";
import "../pokemon-timeline/pokemon-timeline.css";

interface PokemonTimelineProps {
	cards: HoloCardData[];
	cardHref: (card: HoloCardData) => LinkProps;
	onEndReached?: () => void;
}

export function PokemonTimeline({ cards, cardHref, onEndReached }: PokemonTimelineProps) {
	const owned = useStore((s) => s.owned);

	if (cards.length === 0) {
		return (
			<div className="pokemon-timeline-empty">
				<p>No cards match these filters.</p>
			</div>
		);
	}

	const eras = groupCardsByEra(cards);
	return (
		<div className="pokemon-timeline">
			{eras.map((era) => (
				<section key={era.series} className="pokemon-timeline-era">
					<header className="pokemon-timeline-era-header">
						<h2 className="pokemon-timeline-era-name">{era.series}</h2>
						{era.yearLabel && <span className="pokemon-timeline-era-years">{era.yearLabel}</span>}
						<span className="pokemon-timeline-era-count">{era.count} {era.count === 1 ? "card" : "cards"}</span>
					</header>
					<div className="pokemon-timeline-era-cards">
						{era.cards.map((card) => (
							<Link key={card.id} {...cardHref(card)} className="block">
								<HoloCard
									imageUrl={card.imageUrl}
									imageUrlSmall={card.imageUrlSmall}
									name={card.name}
									rarity={card.rarity}
									subtypes={card.subtypes}
									supertype={card.supertype}
									setId={card.setId}
									series={card.setSeries}
									variants={card.variants}
									cardNumber={card.cardNumber}
									owned={!!owned[card.id]}
									hoverOverlay={<CollectionToggle card={card} />}
									style={{ width: 300 }}
								/>
							</Link>
						))}
					</div>
				</section>
			))}
			{onEndReached && (
				<div className="pokemon-timeline-load-more">
					<button type="button" className="pokemon-timeline-load-more-button" onClick={onEndReached}>
						Load more
					</button>
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 3: Typecheck** — `bun run typecheck` → 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/pokemon-timeline.tsx src/components/pokemon-timeline/pokemon-timeline.css
git commit -m "feat(timeline): restore timeline island (TanStack Link, no warmCard)"
```

---

### Task 5: Render timeline in the grid island when `view==="timeline"`

**Files:**
- Modify: `src/components/islands/card-grid-island.tsx`

- [ ] **Step 1: Branch on `view`.** The island already holds the full `cards` array. When `search.view==="timeline"`, render `<PokemonTimeline cards={cards} cardHref={cardHref} onEndReached={loadMore}/>` instead of the Virtuoso grid. Add the import + the branch near the return (before the Virtuoso/fallback returns):

```tsx
import { PokemonTimeline } from "./pokemon-timeline";
// ...
	if (search.view === "timeline") {
		return (
			<div className="h-full overflow-y-auto">
				<PokemonTimeline cards={cards} cardHref={cardHref} onEndReached={cards.length < total ? loadMore : undefined} />
			</div>
		);
	}
```
Note: `search` is already a prop (`ListSearch`), now carrying `view`. Timeline scrolls its own container (not Virtuoso), so it wraps in `overflow-y-auto`.

- [ ] **Step 2: Typecheck + build** — `bun run typecheck` → 0; `bun run build` → 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/card-grid-island.tsx
git commit -m "feat(timeline): grid island renders timeline view on view=timeline"
```

---

### Task 6: Add the toggle to search + pokemon pages

**Files:**
- Modify: `src/routes/search.tsx`
- Modify: `src/routes/pokemon/$name.tsx`

- [ ] **Step 1: Add `ViewModeToggle` to `search.tsx`.** Import it; in the header row, render the toggle wired to the `view` param via `onChange`.

In `SearchPage`, add to the header (next to the count):
```tsx
import { ViewModeToggle } from "../components/islands/view-mode-toggle";
// ...
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">
					{q ? `Results for "${q}"` : "Search"}
				</h1>
				{q ? <span className="text-sm text-muted-foreground">{total} cards</span> : null}
				<div className="ml-auto">
					<ViewModeToggle value={search.view} disabled={!q} onChange={(view) => onChange({ view })} />
				</div>
			</div>
```
(`onChange` already maps to `navigate({search})` via `listSearchToUrl`; ensure `listSearchToUrl` handles `view` — done in Task 2.)

- [ ] **Step 2: Add `ViewModeToggle` to `pokemon/$name.tsx`** the same way (next to the count; `disabled={false}` — there are always results or a 404).

```tsx
import { ViewModeToggle } from "../../components/islands/view-mode-toggle";
// in the header:
				<div className="ml-auto">
					<ViewModeToggle value={search.view} disabled={false} onChange={(view) => onChange({ view })} />
				</div>
```

- [ ] **Step 3: Build + SSR-verify** both pages still 200 + crawlable; toggling `?view=timeline` renders the timeline (client). The SSR seed renders the grid fallback regardless of `view` (timeline is client-only — acceptable, the crawlable content is the same cards).

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s -o /dev/null -w "search=%{http_code}\n" "http://localhost:3000/search?q=charizard"
curl -s -o /dev/null -w "search-timeline=%{http_code}\n" "http://localhost:3000/search?q=charizard&view=timeline"
curl -s -o /dev/null -w "pokemon=%{http_code}\n" "http://localhost:3000/pokemon/charizard"
kill $SERVER_PID
```
Expected: all 200.

- [ ] **Step 4: Commit**

```bash
git add src/routes/search.tsx "src/routes/pokemon/\$name.tsx"
git commit -m "feat(routes): grid/timeline view toggle on search + pokemon pages"
```

---

### Task 7: Verification gate

- [ ] **Step 1: Full gate (parallel):** `bun run typecheck` (0), `biome check --config-path=. src` (clean), `bun test` (all pass: prior + group-cards-by-era), `bun run build` (0, prerender ~180+ pages).
- [ ] **Step 2: Per-route SSR smoke** (6 routes 200; search + `?view=timeline` both 200). Same loop.
- [ ] **Step 3: Commit lint autofixes** if any (`git add -u src/`).

---

## Self-review

- **Spec coverage:** Group 5 — timeline view (#11, restored `PokemonTimeline` + `group-cards-by-era`) + grid↔timeline toggle (#11/#12-adjacent, `ViewModeToggle` + `view` param). The set page stays grid-only (deliberate — one set = one era). Search + pokemon (cross-set) get the toggle.
- **Placeholders:** none.
- **Type consistency:** `ViewMode` (T2, in `card-query.ts`) used by toggle (T3), grid island branch (T5), routes (T6). `view` in `ListSearch`/`LIST_SEARCH_DEFAULTS`/validate/url-codec (T2). `PokemonTimeline` takes `cardHref` (LinkProps) like the grid. `groupCardsByEra` consumes `HoloCardData` with `setReleaseDate`.
- **Restore fidelity:** `group-cards-by-era` verbatim (+ test); `PokemonTimeline` markup verbatim, reworked navigation (Link vs navigate) + dropped `warmCard` (the deleted prefetch — a nicety, not core; noted). `ViewModeToggle` verbatim, only the `ViewMode` import repointed.
- **`setReleaseDate` dependency (T-context):** timeline year-labels need `setReleaseDate`; corpus hydrate + `apiCardToProps` both populate it. If a path lacks it, grouping still works (empty yearLabel) — graceful, not broken.
- **Hydration:** timeline is client-only (inside the grid island, which is under `ClientOnly` on every consumer). SSR renders the grid fallback (crawlable cards) regardless of `view` — no SEO impact, no mismatch.

## Carried forward (post-parity polish, not blocking)

- `warmCard` hover-prefetch (deferred — was a latency nicety).
- Tilt-to-shine on the card modal (deferred from Plan 10).
- Toolbar global Open-Packs button (deferred from Plan 12).
- These three are minor; a single polish plan can mop them up if desired.

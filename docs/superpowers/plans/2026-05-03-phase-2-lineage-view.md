# Phase 2 / #8 — Lineage Timeline View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-03-phase-2-lineage-view-design.md](../specs/2026-05-03-phase-2-lineage-view-design.md)

**Goal:** Add a `view=timeline` toggle on `/pokemon?dex=N` that groups the existing card list by `set.series` and renders era-by-era sections with year range + count headers.

**Architecture:** Three concrete deltas — (1) extend `HoloCardData` and the API mapper with `setSeries` + `setReleaseDate` (additive, populated from the existing API response); (2) add `useViewModeParam()` URL hook + extend `useCards` to expose `hasMore`; (3) build a pure `groupCardsByEra()` helper, a new `<PokemonTimeline>` component that renders era sections with a "Load more" button, and an inline `<ViewModeToggle>` UI. Wire `pokemon-page.tsx` to branch on view mode. Same data, same fetches, same filters — different layout.

**Tech Stack:** React 19 + React Router 7 (data router), TypeScript, Vite 8, Bun (package + test), Biome, happy-dom + @testing-library/react.

---

## File map

**Create:**
- `src/components/pokemon-timeline/index.ts`
- `src/components/pokemon-timeline/pokemon-timeline.tsx`
- `src/components/pokemon-timeline/pokemon-timeline.test.tsx`
- `src/components/pokemon-timeline/pokemon-timeline.css`
- `src/components/pokemon-timeline/group-cards-by-era.ts` — pure helper
- `src/components/pokemon-timeline/group-cards-by-era.test.ts`

**Modify:**
- `src/components/holo-card/types.ts` — add `setSeries` and `setReleaseDate`
- `src/api.ts` — extend `PokemonApiCard.set` to include `releaseDate`; populate new fields in `apiCardToProps`
- `src/hooks/use-url-selection.ts` — add `useViewModeParam` hook
- `src/hooks/use-url-selection.test.tsx` — tests for `useViewModeParam`
- `src/hooks/use-cards.ts` — expose `hasMore` in return value
- `src/pages/pokemon-page.tsx` — read `useViewModeParam`, render `<ViewModeToggle>`, branch between `<CardGrid>` and `<PokemonTimeline>`

---

## Task 1: Extend `HoloCardData` and `apiCardToProps`

**Files:**
- Modify: `src/components/holo-card/types.ts`
- Modify: `src/api.ts`

Adds two fields to the lean card type, both populated from the existing API response. Purely additive — no consumers break.

- [ ] **Step 1.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-lineage && pwd && git branch --show-current
```
Expected: worktree path + `phase-2/lineage`. STOP and report BLOCKED otherwise.

- [ ] **Step 1.2: Update `HoloCardData`**

Read the current `src/components/holo-card/types.ts`. The interface looks like:

```ts
export interface HoloCardData {
	id: string;
	imageUrl: string;
	name: string;
	rarity?: string;
	subtypes?: string[];
	supertype?: string;
	setId: string;
	setName: string;
	cardNumber: string;
	nationalPokedexNumbers?: number[];
}
```

Add two new fields (place after `setName` for grouping with related set fields):

```ts
export interface HoloCardData {
	id: string;
	imageUrl: string;
	name: string;
	rarity?: string;
	subtypes?: string[];
	supertype?: string;
	setId: string;
	setName: string;
	setSeries: string;
	setReleaseDate?: string;
	cardNumber: string;
	nationalPokedexNumbers?: number[];
}
```

`setSeries` is required because the API always returns it. `setReleaseDate` is optional (some older sets in the API may have null/missing dates).

- [ ] **Step 1.3: Update `PokemonApiCard` and `apiCardToProps` in `src/api.ts`**

Read `src/api.ts`. Find the `PokemonApiCard` interface (file-private) and its `set` field:

```ts
interface PokemonApiCard {
	// ...
	set: { id: string; name: string; series: string };
	// ...
}
```

Update to include `releaseDate`:

```ts
interface PokemonApiCard {
	// ...
	set: {
		id: string;
		name: string;
		series: string;
		releaseDate?: string;
	};
	// ...
}
```

Then find `apiCardToProps` (the function mapping API → `HoloCardData`). Add the two new fields:

```ts
function apiCardToProps(card: PokemonApiCard): HoloCardData {
	return {
		id: card.id,
		imageUrl: card.images.large,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		supertype: card.supertype,
		setId: card.set.id,
		setName: card.set.name,
		setSeries: card.set.series,
		setReleaseDate: card.set.releaseDate,
		cardNumber: card.number,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
	};
}
```

- [ ] **Step 1.4: Verify**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 82 tests pass (no new tests yet), typecheck clean, lint with only the pre-existing `card-grid.css !important` warning.

- [ ] **Step 1.5: Commit**

```bash
git add src/components/holo-card/types.ts src/api.ts
git commit -m "feat(api): extend HoloCardData with setSeries + setReleaseDate

Both fields are already in the API response; we just stop dropping
them in apiCardToProps. Populates the data the timeline view needs
for grouping and year-range computation. Purely additive — no consumers
break (Phase 1 #4 cross-link logic + Phase 1 #5 filters + Phase 2 #2a
focus view all unaffected)."
```

---

## Task 2: Add `useViewModeParam` URL hook

**Files:**
- Modify: `src/hooks/use-url-selection.ts`
- Modify: `src/hooks/use-url-selection.test.tsx`

Mirrors the existing `useSetIdParam` / `usePokedexParam` / `useFilterParam` patterns. URL param `view` with values `"grid"` (default, omitted) or `"timeline"`.

- [ ] **Step 2.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-lineage && pwd && git branch --show-current
```

- [ ] **Step 2.2: Write the failing test**

In `src/hooks/use-url-selection.test.tsx`, add `useViewModeParam` to the import (or add a new import line — Biome will sort):

```tsx
import {
	useFilterParam,
	usePokedexParam,
	useSetIdParam,
	useViewModeParam,
} from "./use-url-selection";
```

Add a probe component (alongside the existing `SetIdProbe`, `PokedexProbe`, `FilterProbe`):

```tsx
function ViewModeProbe() {
	const [mode, setMode] = useViewModeParam();
	return (
		<>
			<span data-testid="value">{mode}</span>
			<button type="button" onClick={() => setMode("timeline")}>set-timeline</button>
			<button type="button" onClick={() => setMode("grid")}>set-grid</button>
		</>
	);
}
```

Add a new `describe` block at the bottom of the file:

```tsx
describe("useViewModeParam", () => {
	test("defaults to 'grid' when param is absent", () => {
		renderInRouter(<ViewModeProbe />, "/");
		expect(screen.getByTestId("value").textContent).toBe("grid");
	});

	test("returns 'timeline' when param is 'timeline'", () => {
		renderInRouter(<ViewModeProbe />, "/?view=timeline");
		expect(screen.getByTestId("value").textContent).toBe("timeline");
	});

	test("returns 'grid' for any unknown value (e.g. typo)", () => {
		renderInRouter(<ViewModeProbe />, "/?view=galery");
		expect(screen.getByTestId("value").textContent).toBe("grid");
	});

	test("setting 'timeline' writes the param", () => {
		renderInRouter(<ViewModeProbe />, "/");
		fireEvent.click(screen.getByText("set-timeline"));
		expect(screen.getByTestId("value").textContent).toBe("timeline");
	});

	test("setting 'grid' deletes the param", () => {
		renderInRouter(<ViewModeProbe />, "/?view=timeline");
		fireEvent.click(screen.getByText("set-grid"));
		expect(screen.getByTestId("value").textContent).toBe("grid");
	});
});
```

- [ ] **Step 2.3: Run failing test**

```bash
bun test src/hooks/use-url-selection.test.tsx
```
Expected: FAIL with "useViewModeParam is not exported" or similar.

- [ ] **Step 2.4: Implement the hook**

In `src/hooks/use-url-selection.ts`, append after the existing `useFilterParam`:

```ts
export type ViewMode = "grid" | "timeline";
type SetView = (mode: ViewMode, opts?: UpdateOptions) => void;

/**
 * URL-backed view-mode toggle. Default is "grid" (param omitted from URL);
 * setting "timeline" serializes `view=timeline`. Unknown values (typos,
 * legacy URLs) collapse to the default.
 */
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

The `UpdateOptions` interface is already defined at the top of the file from prior phases — reuse it.

- [ ] **Step 2.5: Run tests**

```bash
bun test src/hooks/use-url-selection.test.tsx
```
Expected: 22 pass (17 previous + 5 new), 0 fail.

- [ ] **Step 2.6: Verify whole suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 87 total pass, typecheck clean.

- [ ] **Step 2.7: Commit**

```bash
git add src/hooks/use-url-selection.ts src/hooks/use-url-selection.test.tsx
git commit -m "feat(hooks): add useViewModeParam for grid/timeline toggle

URL param 'view' with values 'grid' (default, omitted) or 'timeline'.
Unknown values fall back to 'grid' so typos and stale URLs degrade
gracefully."
```

---

## Task 3: Expose `hasMore` from `useCards`

**Files:**
- Modify: `src/hooks/use-cards.ts`

The timeline's "Load more" button needs to know when there are more pages to fetch. Currently `useCards` tracks this internally via `cards.length < totalCount` in its cache; we just expose it in the return shape.

- [ ] **Step 3.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-lineage && pwd && git branch --show-current
```

- [ ] **Step 3.2: Update `src/hooks/use-cards.ts`**

Modify the `UseCardsResult` interface and the return statement:

```ts
interface UseCardsResult {
	cards: HoloCardData[];
	loading: boolean;
	loadMore: (key: string) => void;
	hasMore: boolean;
}
```

At the bottom of the hook, before the return:

```ts
const cards = selectedKey ? (cache[selectedKey]?.cards ?? []) : [];
const entry = selectedKey ? cache[selectedKey] : undefined;
const hasMore = !!entry && entry.cards.length < entry.totalCount;

return { cards, loading, loadMore, hasMore };
```

`hasMore` is `false` until the first page loads (cache entry doesn't exist yet) — this is intentional, the page-level "Loading…" pill covers the initial-fetch state, and the "Load more" button only appears after data arrives.

- [ ] **Step 3.3: Verify**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 87 tests still pass (additive change to return shape; existing consumers ignore the new field). Typecheck clean.

- [ ] **Step 3.4: Commit**

```bash
git add src/hooks/use-cards.ts
git commit -m "feat(use-cards): expose hasMore in return value

Derived from cache entry: cards.length < totalCount when an entry
exists, false otherwise. Used by the timeline view's 'Load more'
button. Existing consumers (CardGrid via Virtuoso's endReached)
unaffected — they ignore the new field."
```

---

## Task 4: Pure `groupCardsByEra` helper (TDD)

**Files:**
- Create: `src/components/pokemon-timeline/group-cards-by-era.ts`
- Test: `src/components/pokemon-timeline/group-cards-by-era.test.ts`

A pure function that takes the flat `HoloCardData[]` and returns era-grouped output, sorted by earliest release date with year ranges + counts pre-computed.

- [ ] **Step 4.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-lineage && pwd && git branch --show-current
```

- [ ] **Step 4.2: Write the failing test**

Create `src/components/pokemon-timeline/group-cards-by-era.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { HoloCardData } from "../holo-card";
import { groupCardsByEra } from "./group-cards-by-era";

function fixture(overrides: Partial<HoloCardData>): HoloCardData {
	return {
		id: overrides.id ?? "test-1",
		imageUrl: "https://example.invalid/test.png",
		name: "Test",
		setId: overrides.setId ?? "test",
		setName: overrides.setName ?? "Test Set",
		setSeries: overrides.setSeries ?? "Base",
		setReleaseDate: overrides.setReleaseDate,
		cardNumber: overrides.cardNumber ?? "1",
		...overrides,
	};
}

describe("groupCardsByEra", () => {
	test("returns empty array for empty input", () => {
		expect(groupCardsByEra([])).toEqual([]);
	});

	test("groups cards by setSeries", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "b", setSeries: "Base", setReleaseDate: "1999-06-16" }),
			fixture({ id: "c", setSeries: "Neo", setReleaseDate: "2000-12-16" }),
		];
		const result = groupCardsByEra(cards);
		expect(result).toHaveLength(2);
		expect(result[0].series).toBe("Base");
		expect(result[0].cards).toHaveLength(2);
		expect(result[1].series).toBe("Neo");
		expect(result[1].cards).toHaveLength(1);
	});

	test("sorts eras by earliest setReleaseDate (oldest first)", () => {
		const cards = [
			fixture({ id: "swsh1", setSeries: "Sword & Shield", setReleaseDate: "2020-02-07" }),
			fixture({ id: "base1", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "neo1", setSeries: "Neo", setReleaseDate: "2000-12-16" }),
		];
		const result = groupCardsByEra(cards);
		expect(result.map((g) => g.series)).toEqual([
			"Base",
			"Neo",
			"Sword & Shield",
		]);
	});

	test("computes single-year range when all cards share a year", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "b", setSeries: "Base", setReleaseDate: "1999-12-15" }),
		];
		const result = groupCardsByEra(cards);
		expect(result[0].yearLabel).toBe("1999");
	});

	test("computes year range when cards span multiple years", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Sword & Shield", setReleaseDate: "2020-02-07" }),
			fixture({ id: "b", setSeries: "Sword & Shield", setReleaseDate: "2022-04-15" }),
		];
		const result = groupCardsByEra(cards);
		expect(result[0].yearLabel).toBe("2020 — 2022");
	});

	test("includes a count of cards in each era", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "b", setSeries: "Base", setReleaseDate: "1999-06-16" }),
			fixture({ id: "c", setSeries: "Base", setReleaseDate: "1999-10-10" }),
		];
		const result = groupCardsByEra(cards);
		expect(result[0].count).toBe(3);
	});

	test("groups cards with missing series under 'Other'", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "b", setSeries: "", setReleaseDate: "2024-01-01" }),
		];
		const result = groupCardsByEra(cards);
		const otherGroup = result.find((g) => g.series === "Other");
		expect(otherGroup).toBeDefined();
		expect(otherGroup?.cards).toHaveLength(1);
	});

	test("handles cards with missing release dates (sorts as 'last' when no date in group)", () => {
		// One era with dates, one without — the one with no dates falls to the end.
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "b", setSeries: "Mystery", setReleaseDate: undefined }),
		];
		const result = groupCardsByEra(cards);
		expect(result[0].series).toBe("Base");
		expect(result[1].series).toBe("Mystery");
		expect(result[1].yearLabel).toBe("");
	});

	test("preserves card order within each group (input order)", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-06-16" }),
			fixture({ id: "b", setSeries: "Base", setReleaseDate: "1999-01-09" }),
		];
		const result = groupCardsByEra(cards);
		// Cards within an era stay in input order (not re-sorted) — the input
		// is already chronological from the API's orderBy=set.releaseDate,number.
		expect(result[0].cards.map((c) => c.id)).toEqual(["a", "b"]);
	});
});
```

- [ ] **Step 4.3: Run failing test**

```bash
bun test src/components/pokemon-timeline/group-cards-by-era.test.ts
```
Expected: FAIL with "Cannot find module './group-cards-by-era'".

- [ ] **Step 4.4: Implement the helper**

Create `src/components/pokemon-timeline/group-cards-by-era.ts`:

```ts
import type { HoloCardData } from "../holo-card";

export interface CardEraGroup {
	series: string;
	yearLabel: string; // "" if no dates available
	count: number;
	cards: HoloCardData[];
}

/**
 * Group an array of cards by their `setSeries`, sort the groups by the
 * earliest `setReleaseDate` in each group (oldest first), and compute a
 * year-range label per group.
 *
 * Cards with missing/empty `setSeries` are bucketed into "Other".
 * Cards within each group preserve their input order — the caller is
 * expected to pass cards already sorted chronologically (the
 * pokemontcg.io API does this via `orderBy=set.releaseDate,number`).
 *
 * Groups with no release dates at all (all undefined) sort to the end
 * and get `yearLabel: ""`.
 */
export function groupCardsByEra(cards: HoloCardData[]): CardEraGroup[] {
	const groups = new Map<string, HoloCardData[]>();
	for (const card of cards) {
		const series = card.setSeries || "Other";
		const list = groups.get(series);
		if (list) list.push(card);
		else groups.set(series, [card]);
	}

	const result: (CardEraGroup & { earliest: number | null })[] = [];
	for (const [series, cardsInEra] of groups) {
		let minDate: number | null = null;
		let maxDate: number | null = null;
		for (const card of cardsInEra) {
			if (!card.setReleaseDate) continue;
			const t = Date.parse(card.setReleaseDate);
			if (Number.isNaN(t)) continue;
			if (minDate === null || t < minDate) minDate = t;
			if (maxDate === null || t > maxDate) maxDate = t;
		}
		let yearLabel = "";
		if (minDate !== null && maxDate !== null) {
			const minYear = new Date(minDate).getUTCFullYear();
			const maxYear = new Date(maxDate).getUTCFullYear();
			yearLabel = minYear === maxYear ? `${minYear}` : `${minYear} — ${maxYear}`;
		}
		result.push({
			series,
			yearLabel,
			count: cardsInEra.length,
			cards: cardsInEra,
			earliest: minDate,
		});
	}

	// Sort: groups with a date by earliest ascending; groups without dates last.
	result.sort((a, b) => {
		if (a.earliest === null && b.earliest === null) return 0;
		if (a.earliest === null) return 1;
		if (b.earliest === null) return -1;
		return a.earliest - b.earliest;
	});

	// Strip the internal `earliest` field from the public shape.
	return result.map(({ earliest: _e, ...rest }) => rest);
}
```

- [ ] **Step 4.5: Run tests**

```bash
bun test src/components/pokemon-timeline/group-cards-by-era.test.ts
```
Expected: 9 pass, 0 fail.

- [ ] **Step 4.6: Verify whole suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 96 total pass.

- [ ] **Step 4.7: Commit**

```bash
git add src/components/pokemon-timeline/group-cards-by-era.ts src/components/pokemon-timeline/group-cards-by-era.test.ts
git commit -m "feat(pokemon-timeline): add groupCardsByEra pure helper

Groups cards by setSeries, sorts groups by earliest release date,
computes year-range label per group. Cards with missing series go
to 'Other'; groups with no dates sort last with yearLabel:''.
Pure function with 9 unit tests."
```

---

## Task 5: Build `<PokemonTimeline>` component (TDD)

**Files:**
- Create: `src/components/pokemon-timeline/pokemon-timeline.tsx`
- Create: `src/components/pokemon-timeline/index.ts`
- Test: `src/components/pokemon-timeline/pokemon-timeline.test.tsx`
- Create: `src/components/pokemon-timeline/pokemon-timeline.css`

The visible component. Renders era sections; pagination via "Load more" button.

- [ ] **Step 5.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-lineage && pwd && git branch --show-current
```

- [ ] **Step 5.2: Write the failing test**

Create `src/components/pokemon-timeline/pokemon-timeline.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { MemoryRouter } from "react-router";
import type { HoloCardData } from "../holo-card";
import { PokemonTimeline } from "./pokemon-timeline";

function fixture(overrides: Partial<HoloCardData>): HoloCardData {
	return {
		id: overrides.id ?? "test-1",
		imageUrl: overrides.imageUrl ?? "https://example.invalid/test.png",
		name: overrides.name ?? "Test",
		setId: overrides.setId ?? "test",
		setName: overrides.setName ?? "Test Set",
		setSeries: overrides.setSeries ?? "Base",
		setReleaseDate: overrides.setReleaseDate,
		cardNumber: overrides.cardNumber ?? "1",
		...overrides,
	};
}

const SAMPLE_CARDS: HoloCardData[] = [
	fixture({
		id: "base1-58",
		name: "Pikachu",
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		setReleaseDate: "1999-01-09",
	}),
	fixture({
		id: "neo1-12",
		name: "Pikachu",
		setId: "neo1",
		setName: "Neo Genesis",
		setSeries: "Neo",
		setReleaseDate: "2000-12-16",
	}),
	fixture({
		id: "swsh4-43",
		name: "Pikachu V",
		setId: "swsh4",
		setName: "Vivid Voltage",
		setSeries: "Sword & Shield",
		setReleaseDate: "2020-11-13",
	}),
];

function renderInRouter(ui: React.ReactElement) {
	return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("<PokemonTimeline />", () => {
	test("renders a section per era", () => {
		renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
			/>,
		);
		expect(screen.getByRole("heading", { name: /Base/i })).toBeDefined();
		expect(screen.getByRole("heading", { name: /Neo/i })).toBeDefined();
		expect(screen.getByRole("heading", { name: /Sword & Shield/i })).toBeDefined();
	});

	test("renders eras in chronological order (oldest first)", () => {
		const { container } = renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
			/>,
		);
		const headings = Array.from(
			container.querySelectorAll(".pokemon-timeline-era-name"),
		).map((el) => el.textContent);
		expect(headings).toEqual(["Base", "Neo", "Sword & Shield"]);
	});

	test("renders era header with year and count", () => {
		renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
			/>,
		);
		expect(screen.getByText(/1999/)).toBeDefined();
		expect(screen.getByText(/2000/)).toBeDefined();
		expect(screen.getByText(/2020/)).toBeDefined();
		// Three "1 card" labels (one per era, one card each)
		expect(screen.getAllByText(/1 card/i)).toHaveLength(3);
	});

	test("renders 'Load more' button when hasMore is true and not loading", () => {
		renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={true}
				onLoadMore={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: /load more/i })).toBeDefined();
	});

	test("does not render 'Load more' when hasMore is false", () => {
		renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
			/>,
		);
		expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
	});

	test("calls onLoadMore when Load more is clicked", () => {
		let calls = 0;
		renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={true}
				onLoadMore={() => calls++}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /load more/i }));
		expect(calls).toBe(1);
	});

	test("renders empty-state when no cards", () => {
		renderInRouter(
			<PokemonTimeline
				cards={[]}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
			/>,
		);
		expect(screen.getByText(/no cards/i)).toBeDefined();
	});

	test("hoverOverlay slot is wired through to each card", () => {
		renderInRouter(
			<PokemonTimeline
				cards={[SAMPLE_CARDS[0]]}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
				renderOverlay={(card) => <span data-testid={`overlay-${card.id}`}>OL</span>}
			/>,
		);
		expect(screen.getByTestId("overlay-base1-58")).toBeDefined();
	});
});
```

- [ ] **Step 5.3: Run failing test**

```bash
bun test src/components/pokemon-timeline/pokemon-timeline.test.tsx
```
Expected: FAIL with "Cannot find module './pokemon-timeline'".

- [ ] **Step 5.4: Implement the component**

Create `src/components/pokemon-timeline/pokemon-timeline.tsx`:

```tsx
import type React from "react";
import { useNavigate } from "react-router";
import { HoloCard, type HoloCardData } from "../holo-card";
import { groupCardsByEra } from "./group-cards-by-era";
import "./pokemon-timeline.css";

interface PokemonTimelineProps {
	cards: HoloCardData[];
	loading: boolean;
	hasMore: boolean;
	onLoadMore: () => void;
	renderOverlay?: (card: HoloCardData) => React.ReactNode;
}

export function PokemonTimeline({
	cards,
	loading,
	hasMore,
	onLoadMore,
	renderOverlay,
}: PokemonTimelineProps) {
	const navigate = useNavigate();

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
						{era.yearLabel && (
							<span className="pokemon-timeline-era-years">
								{era.yearLabel}
							</span>
						)}
						<span className="pokemon-timeline-era-count">
							{era.count} {era.count === 1 ? "card" : "cards"}
						</span>
					</header>
					<div className="pokemon-timeline-era-cards">
						{era.cards.map((card) => (
							<HoloCard
								key={card.id}
								imageUrl={card.imageUrl}
								name={card.name}
								rarity={card.rarity}
								subtypes={card.subtypes}
								supertype={card.supertype}
								setId={card.setId}
								cardNumber={card.cardNumber}
								hoverOverlay={renderOverlay?.(card)}
								onClick={(e) => {
									if (e.defaultPrevented) return;
									navigate(`/card/${card.id}`);
								}}
								style={{ width: 300 }}
							/>
						))}
					</div>
				</section>
			))}
			{hasMore && !loading && (
				<div className="pokemon-timeline-load-more">
					<button
						type="button"
						className="pokemon-timeline-load-more-button"
						onClick={onLoadMore}
					>
						Load more
					</button>
				</div>
			)}
		</div>
	);
}
```

The `e.defaultPrevented` guard matches the Phase 2 #2a fix in `<CardGrid>` so hover overlay links still work.

- [ ] **Step 5.5: Create the index module**

Create `src/components/pokemon-timeline/index.ts`:

```ts
export { PokemonTimeline } from "./pokemon-timeline";
export { groupCardsByEra, type CardEraGroup } from "./group-cards-by-era";
```

- [ ] **Step 5.6: Create the CSS**

Create `src/components/pokemon-timeline/pokemon-timeline.css`:

```css
/*
 * Lineage timeline view: one section per TCG era, era header + flex/grid
 * of cards within. Renders inside the existing /pokemon page when the
 * `view=timeline` URL param is set.
 */

.pokemon-timeline {
	padding: 0 1rem 2rem;
}

.pokemon-timeline-empty {
	padding: 2rem 1rem;
	color: rgba(255, 255, 255, 0.6);
	text-align: center;
}

.pokemon-timeline-era {
	margin-bottom: 2.5rem;
}

.pokemon-timeline-era-header {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.75rem;
	padding: 0.75rem 0;
	margin-bottom: 0.75rem;
	border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.pokemon-timeline-era-name {
	margin: 0;
	font-size: 1.25rem;
	font-weight: 600;
}

.pokemon-timeline-era-years {
	color: rgba(255, 255, 255, 0.65);
	font-size: 0.95rem;
}

.pokemon-timeline-era-count {
	margin-left: auto;
	color: rgba(255, 255, 255, 0.5);
	font-size: 0.85rem;
}

.pokemon-timeline-era-cards {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	gap: 1rem;
}

.pokemon-timeline-load-more {
	display: flex;
	justify-content: center;
	margin-top: 2rem;
}

.pokemon-timeline-load-more-button {
	padding: 0.75rem 2rem;
	background: rgba(120, 100, 255, 0.18);
	border: 1px solid rgba(120, 100, 255, 0.5);
	border-radius: 8px;
	color: inherit;
	font-size: 0.95rem;
	cursor: pointer;
	transition: background 0.12s ease-out;
}

.pokemon-timeline-load-more-button:hover,
.pokemon-timeline-load-more-button:focus-visible {
	background: rgba(120, 100, 255, 0.3);
	outline: none;
}
```

- [ ] **Step 5.7: Run tests**

```bash
bun test src/components/pokemon-timeline/
```
Expected: 17 pass (9 helper + 8 component), 0 fail.

- [ ] **Step 5.8: Verify whole suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 104 total pass (was 96; +8 new component tests).

- [ ] **Step 5.9: Commit**

```bash
git add src/components/pokemon-timeline/
git commit -m "feat(pokemon-timeline): add timeline component

Renders era-by-era sections with header (name, year range, count) and
a flex/grid of <HoloCard> instances. Click a card → /card/:id (with
defaultPrevented guard so hover overlay links work). Load more button
fires onLoadMore when hasMore && !loading. Empty-state message when
cards is empty."
```

---

## Task 6: Wire `pokemon-page.tsx` with `<ViewModeToggle>` and view branching

**Files:**
- Modify: `src/pages/pokemon-page.tsx`

Adds an inline `<ViewModeToggle>` and branches between `<CardGrid>` and `<PokemonTimeline>` based on the URL view mode.

- [ ] **Step 6.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-lineage && pwd && git branch --show-current
```

- [ ] **Step 6.2: Update `src/pages/pokemon-page.tsx`**

Replace the contents of `src/pages/pokemon-page.tsx` with:

```tsx
import { useMemo } from "react";
import { getCardsByPokedexNumber } from "../api";
import { CardGrid } from "../components/card-grid";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import { FilterChipRow } from "../components/filter-chip-row";
import "../components/header.css";
import type { HoloCardData } from "../components/holo-card";
import { PokemonFilter } from "../components/pokemon-filter";
import { PokemonTimeline } from "../components/pokemon-timeline";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { useFilterValues } from "../hooks/use-filter-values";
import {
	useFilterParam,
	usePokedexParam,
	useViewModeParam,
	type ViewMode,
} from "../hooks/use-url-selection";
import "./pokemon-page.css";

function renderOverlay(card: HoloCardData) {
	return (
		<CrossLinkOverlay
			links={[{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` }]}
		/>
	);
}

interface ViewModeToggleProps {
	value: ViewMode;
	onChange: (next: ViewMode) => void;
	disabled: boolean;
}

function ViewModeToggle({ value, onChange, disabled }: ViewModeToggleProps) {
	return (
		<div className="view-mode-toggle" role="group" aria-label="View mode">
			<button
				type="button"
				className={`view-mode-toggle-button${value === "grid" ? " active" : ""}`}
				onClick={() => onChange("grid")}
				disabled={disabled}
				aria-pressed={value === "grid"}
			>
				Grid
			</button>
			<button
				type="button"
				className={`view-mode-toggle-button${value === "timeline" ? " active" : ""}`}
				onClick={() => onChange("timeline")}
				disabled={disabled}
				aria-pressed={value === "timeline"}
			>
				Timeline
			</button>
		</div>
	);
}

export function PokemonPage() {
	const filterValues = useFilterValues();
	const [pokedexNumber, setPokedexNumber] = usePokedexParam();
	const [view, setView] = useViewModeParam();
	const [types] = useFilterParam("types");
	const [rarity] = useFilterParam("rarity");
	const [supertype] = useFilterParam("supertype");
	const [subtypes] = useFilterParam("subtypes");

	const filterSig = `${types.join(",")}|${rarity.join(",")}|${supertype.join(",")}|${subtypes.join(",")}`;
	const baseKey = pokedexNumber === null ? null : String(pokedexNumber);
	const cacheKey = baseKey
		? filterSig === "|||"
			? baseKey
			: `${baseKey}|${filterSig}`
		: null;

	const fetcher: CardFetcher = useMemo(
		() => (_key, page, pageSize) => {
			if (pokedexNumber === null) {
				return Promise.resolve({ cards: [], totalCount: 0 });
			}
			return getCardsByPokedexNumber(pokedexNumber, page, pageSize, {
				types,
				rarity,
				supertype,
				subtypes,
			});
		},
		[pokedexNumber, types, rarity, supertype, subtypes],
	);

	const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);

	return (
		<>
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Filter by Pokémon</div>
						<div className="set-sub">
							{pokedexNumber === null
								? "Pick a Pokémon to see every holo card across every set"
								: `National Pokédex #${pokedexNumber} · ${cards.length} cards loaded`}
						</div>
					</div>
					<ViewModeToggle
						value={view}
						onChange={setView}
						disabled={pokedexNumber === null}
					/>
				</div>
			</header>
			<PokemonFilter value={pokedexNumber} onChange={setPokedexNumber} />
			<FilterChipRow
				types={filterValues.types}
				rarities={filterValues.rarities}
				supertypes={filterValues.supertypes}
				subtypes={filterValues.subtypes}
			/>
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
					onLoadMore={() => {
						if (cacheKey) loadMore(cacheKey);
					}}
					renderOverlay={renderOverlay}
				/>
			)}
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
```

- [ ] **Step 6.3: Add toggle CSS to `src/pages/pokemon-page.css`**

Read `src/pages/pokemon-page.css`. Append the following at the end:

```css
.view-mode-toggle {
	display: inline-flex;
	gap: 0.25rem;
	padding: 0.25rem;
	background: rgba(255, 255, 255, 0.05);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 999px;
}

.view-mode-toggle-button {
	padding: 0.35rem 0.85rem;
	background: transparent;
	border: none;
	border-radius: 999px;
	color: rgba(255, 255, 255, 0.65);
	font-size: 0.85rem;
	cursor: pointer;
	transition:
		background 0.12s ease-out,
		color 0.12s ease-out;
}

.view-mode-toggle-button:hover:not(:disabled) {
	color: rgba(255, 255, 255, 0.95);
}

.view-mode-toggle-button:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.view-mode-toggle-button.active {
	background: rgba(120, 100, 255, 0.25);
	color: #fff;
}
```

- [ ] **Step 6.4: Verify**

```bash
bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 104 pass, typecheck clean, lint with only the pre-existing warning, build succeeds.

- [ ] **Step 6.5: Commit**

```bash
git add src/pages/pokemon-page.tsx src/pages/pokemon-page.css
git commit -m "feat(pokemon-page): wire view-mode toggle + timeline branch

Renders an inline <ViewModeToggle> in the page header and branches
between <CardGrid> (grid view) and <PokemonTimeline> (timeline view)
based on the URL ?view= param. The same cards/loading/loadMore state
feeds both views; only the layout differs. Toggle is disabled when no
Pokémon is selected."
```

---

## Task 7: Final verification suite

**Files:** none (read-only verification)

- [ ] **Step 7.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-lineage && pwd && git branch --show-current
```

- [ ] **Step 7.2: Run all checks**

```bash
bun run typecheck
```
Expected: zero errors.

```bash
bun run lint
```
Expected: only the pre-existing `card-grid.css !important` warning.

```bash
bun test
```
Expected: 104 pass / 0 fail (Phase 0+1+2#2a's 82 + 22 added in #8).

```bash
bun run build
```
Expected: success.

- [ ] **Step 7.3: Manual smoke test in dev**

Start the dev server:

```bash
bun run dev
```

In a browser at `http://localhost:5173/pokemon-tcg-viewer/`:

1. Navigate to `/pokemon`. Pick Pikachu via the search field. URL becomes `/pokemon?dex=25`. Grid view loads.
2. Click "Timeline" toggle. URL becomes `/pokemon?dex=25&view=timeline`. Page re-renders as era sections.
3. Verify era headers show "Base", "Neo", etc. with year ranges and counts.
4. Click a card → `/card/<id>` focus view loads.
5. Hit browser back → returns to `/pokemon?dex=25&view=timeline`. Timeline still shows.
6. Click "Load more" → more cards fetch → eras grow or new ones appear at correct chronological position.
7. Apply a rarity filter (e.g., "Rare Holo VMAX"). Timeline updates to show only that rarity's eras.
8. Hover a card → cross-link overlay appears (Phase 1 #4). Click "Go to <Set>" → returns to `/?setId=<set>` (Phase 1 #4 still works).
9. Click "Grid" toggle → URL drops `view`, grid view returns.
10. Reload `/pokemon?dex=25&view=timeline` directly → timeline loads immediately, no grid flash.
11. Toggle disabled state: navigate to `/pokemon` (no dex). Toggle is greyed out / un-clickable. ✓

If any step fails, debug, fix, and commit. If smoke passes, no commit needed.

- [ ] **Step 7.4: Console-clean check**

While the dev server is running, open browser console. Expect:
- No errors from React Router.
- No `[holo-card] Unknown rarity` warnings (Phase 0 invariant).
- No errors from the API.

- [ ] **Step 7.5: Update spec status**

Edit `docs/superpowers/specs/2026-05-03-phase-2-lineage-view-design.md`. Change:

```markdown
**Status:** Approved (design)
```

to:

```markdown
**Status:** Implemented
```

Commit:

```bash
git add docs/superpowers/specs/2026-05-03-phase-2-lineage-view-design.md
git commit -m "docs: mark Phase 2 #8 lineage view spec as implemented"
```

---

## Done criteria

- [ ] All Phase 2 #8 tasks (1–7) above are checked off.
- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` all pass.
- [ ] Manual smoke test (Step 7.3) passes — toggle, era grouping, click-through, filters, hover overlay, browser back all work.
- [ ] Spec status reads "Implemented".

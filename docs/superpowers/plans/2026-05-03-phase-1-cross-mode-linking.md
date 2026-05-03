# Phase 1 / #4 — Cross-Mode Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-03-phase-1-cross-mode-linking-design.md](../specs/2026-05-03-phase-1-cross-mode-linking-design.md)

**Goal:** Add cross-mode navigation links from a card's hover overlay (Set view → Pokémon view; Pokémon view → Set view), with selection state migrated from localStorage to URL search params.

**Architecture:** Three concrete deltas — (1) URL becomes the source of truth for `setId` / `dex` selection via two new hooks; (2) `HoloCardData` and the API client gain `setName` + `nationalPokedexNumbers` so cards know which Pokémon they depict and which set they belong to; (3) a new `<CrossLinkOverlay>` component renders into Phase 0's `HoloCard.hoverOverlay` slot, with each page constructing the appropriate link set. Plus React Router's `<ScrollRestoration />` for browser back/forward.

**Tech Stack:** React 19 + React Router 7, TypeScript, Vite 8, Bun (package + test), Biome, happy-dom + @testing-library/react.

---

## File map

**Create:**
- `src/utils/display-name.ts` — `displayName(name: string)` hoisted from `pokemon-filter.tsx`
- `src/utils/display-name.test.ts`
- `src/utils/pokemon-name.ts` — `pokemonNameByDex(list, n)` selector helper
- `src/utils/pokemon-name.test.ts`
- `src/hooks/use-url-selection.ts` — `useSetIdParam` + `usePokedexParam`
- `src/hooks/use-url-selection.test.tsx`
- `src/components/cross-link-overlay/index.ts`
- `src/components/cross-link-overlay/cross-link-overlay.tsx`
- `src/components/cross-link-overlay/cross-link-overlay.test.tsx`
- `src/components/cross-link-overlay/cross-link-overlay.css`

**Modify:**
- `src/components/holo-card/types.ts` — add `setName` (required) and `nationalPokedexNumbers` (optional)
- `src/api.ts` — extend `select=`, add fields to `PokemonApiCard`, copy through in `apiCardToProps`
- `src/components/pokemon-filter.tsx` — import `displayName` from utils
- `src/components/card-grid.tsx` — add `renderOverlay?: (card) => ReactNode` prop
- `src/pages/sets-page.tsx` — use `useSetIdParam`, render cross-link overlay
- `src/pages/pokemon-page.tsx` — use `usePokedexParam`, render cross-link overlay
- `src/store/ui-slice.ts` — remove `selectedSetId` / `selectedPokedexNumber` (or delete file if it becomes empty)
- `src/store/index.ts` — drop the two fields from `partialize`, bump `STORAGE_VERSION`
- `src/app.tsx` — add `<ScrollRestoration />`

---

## Task 1: Hoist `displayName` helper

**Files:**
- Create: `src/utils/display-name.ts`
- Test: `src/utils/display-name.test.ts`
- Modify: `src/components/pokemon-filter.tsx`

- [ ] **Step 1.1: Confirm working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```
Expected: worktree path + `phase-1/cross-mode-linking`. STOP if either is wrong.

- [ ] **Step 1.2: Write the failing test**

Create `src/utils/display-name.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { displayName } from "./display-name";

describe("displayName", () => {
	test("uppercases the first letter", () => {
		expect(displayName("pikachu")).toBe("Pikachu");
	});

	test("splits on hyphens and title-cases each segment", () => {
		expect(displayName("mr-mime")).toBe("Mr Mime");
		expect(displayName("nidoran-f")).toBe("Nidoran F");
	});

	test("returns empty string unchanged", () => {
		expect(displayName("")).toBe("");
	});
});
```

- [ ] **Step 1.3: Run the test, expect failure**

```bash
bun test src/utils/display-name.test.ts
```
Expected: FAIL with "Cannot find module './display-name'".

- [ ] **Step 1.4: Implement `display-name.ts`**

Create `src/utils/display-name.ts`:

```ts
/**
 * Convert a pokeapi-style lowercase-with-hyphens name (e.g. "mr-mime") into
 * a human-readable form ("Mr Mime"). Used for both the search filter and
 * cross-link overlay labels so display matches across the app.
 */
export function displayName(name: string): string {
	if (!name) return "";
	return name
		.split("-")
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join(" ");
}
```

- [ ] **Step 1.5: Run the test, expect pass**

```bash
bun test src/utils/display-name.test.ts
```
Expected: 3 pass, 0 fail.

- [ ] **Step 1.6: Update `pokemon-filter.tsx` to import from utils**

In `src/components/pokemon-filter.tsx`:

Remove the local `displayName` function (lines ~12-17, the one inside the file). Add an import at the top of the file (after the other imports):

```tsx
import { displayName } from "../utils/display-name";
```

The file should now have no inline `displayName` function. The four call sites (search them with `grep -n displayName src/components/pokemon-filter.tsx`) all continue to work because the imported name is identical.

- [ ] **Step 1.7: Verify nothing broke**

```bash
bun run typecheck
bun run lint
bun test src/components/holo-card/ src/utils/
```
Expected: typecheck clean, lint only the pre-existing `card-grid.css !important` warning, all tests pass.

- [ ] **Step 1.8: Commit**

```bash
git add src/utils/display-name.ts src/utils/display-name.test.ts src/components/pokemon-filter.tsx
git commit -m "refactor: hoist displayName helper to src/utils

Phase 1 needs the same case-formatting for cross-link labels. Same
function, shared module."
```

---

## Task 2: `pokemonNameByDex` helper

**Files:**
- Create: `src/utils/pokemon-name.ts`
- Test: `src/utils/pokemon-name.test.ts`

- [ ] **Step 2.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```
Expected: worktree + `phase-1/cross-mode-linking`. STOP if not.

- [ ] **Step 2.2: Write the failing test**

Create `src/utils/pokemon-name.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { PokemonListEntry } from "../api";
import { pokemonNameByDex } from "./pokemon-name";

const list: PokemonListEntry[] = [
	{ name: "bulbasaur", url: "" },
	{ name: "ivysaur", url: "" },
	{ name: "venusaur", url: "" },
];

describe("pokemonNameByDex", () => {
	test("returns the display name for a valid pokédex number (1-indexed)", () => {
		expect(pokemonNameByDex(list, 1)).toBe("Bulbasaur");
		expect(pokemonNameByDex(list, 3)).toBe("Venusaur");
	});

	test("returns null for out-of-range numbers", () => {
		expect(pokemonNameByDex(list, 0)).toBeNull();
		expect(pokemonNameByDex(list, 4)).toBeNull();
		expect(pokemonNameByDex(list, -1)).toBeNull();
	});

	test("returns null when list is null (not yet loaded)", () => {
		expect(pokemonNameByDex(null, 1)).toBeNull();
	});

	test("title-cases hyphenated names (e.g. mr-mime)", () => {
		const withHyphen: PokemonListEntry[] = [{ name: "mr-mime", url: "" }];
		expect(pokemonNameByDex(withHyphen, 1)).toBe("Mr Mime");
	});
});
```

- [ ] **Step 2.3: Run the test, expect failure**

```bash
bun test src/utils/pokemon-name.test.ts
```
Expected: FAIL with module-not-found.

- [ ] **Step 2.4: Implement `pokemon-name.ts`**

Create `src/utils/pokemon-name.ts`:

```ts
import type { PokemonListEntry } from "../api";
import { displayName } from "./display-name";

/**
 * Look up a Pokémon's display name from the pokeapi.co list, indexed by
 * national pokédex number (1-indexed). Returns null if the list isn't
 * loaded yet or the number is out of range.
 */
export function pokemonNameByDex(
	list: PokemonListEntry[] | null,
	pokedexNumber: number,
): string | null {
	if (!list) return null;
	if (pokedexNumber < 1 || pokedexNumber > list.length) return null;
	const entry = list[pokedexNumber - 1];
	return displayName(entry.name);
}
```

- [ ] **Step 2.5: Run the test, expect pass**

```bash
bun test src/utils/pokemon-name.test.ts
```
Expected: 4 pass, 0 fail.

- [ ] **Step 2.6: Verify nothing broke**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 2.7: Commit**

```bash
git add src/utils/pokemon-name.ts src/utils/pokemon-name.test.ts
git commit -m "feat: add pokemonNameByDex helper

Cross-link overlays need pokédex# → display name. Pure function so the
overlay can stay simple."
```

---

## Task 3: Extend `HoloCardData` and API mapping

**Files:**
- Modify: `src/components/holo-card/types.ts`
- Modify: `src/api.ts`

- [ ] **Step 3.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```

- [ ] **Step 3.2: Update `HoloCardData` type**

In `src/components/holo-card/types.ts`, replace the contents with:

```ts
/**
 * Card data shape consumed by <HoloCard /> and the cross-link overlays.
 * Matches the previous external package's HoloCardData with the additions
 * needed for Phase 1 cross-mode linking.
 */
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

`setName` is required (the API always returns it). `nationalPokedexNumbers` is optional (Trainers, Energies, Special Energies have none).

- [ ] **Step 3.3: Update `src/api.ts`**

In `src/api.ts`, modify the `PokemonApiCard` interface and `apiCardToProps` function. Replace the relevant section (lines roughly 3-25) with:

```ts
import type { HoloCardData } from "./components/holo-card";

interface PokemonApiCard {
	id: string;
	name: string;
	supertype: string;
	subtypes?: string[];
	rarity?: string;
	number: string;
	nationalPokedexNumbers?: number[];
	set: { id: string; name: string; series: string };
	images: { small: string; large: string };
}

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
		cardNumber: card.number,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
	};
}
```

Then update the `getCardsByQuery` function's `select=` parameter to include the new field. Find the line:

```ts
`https://api.pokemontcg.io/v2/cards?select=id,name,number,images,rarity,subtypes,supertype,set&orderBy=...`
```

Replace `select=id,name,number,images,rarity,subtypes,supertype,set` with `select=id,name,number,images,rarity,subtypes,supertype,set,nationalPokedexNumbers`.

- [ ] **Step 3.4: Verify typecheck**

```bash
bun run typecheck
```
Expected: zero errors. (`apiCardToProps` returns the expanded shape; nothing downstream breaks because the new fields are added, not removed.)

- [ ] **Step 3.5: Verify tests still pass**

```bash
bun test
```
Expected: 17 pass / 0 fail. Existing tests don't reference the new fields, so they should be unaffected.

- [ ] **Step 3.6: Commit**

```bash
git add src/components/holo-card/types.ts src/api.ts
git commit -m "feat(api): include setName + nationalPokedexNumbers in card data

The pokemontcg.io API supports both fields; we just weren't fetching
them. Cross-link overlays need both: pokédex numbers to build links to
By-Pokémon view, set name to label the link in the other direction."
```

---

## Task 4: URL selection hooks

**Files:**
- Create: `src/hooks/use-url-selection.ts`
- Test: `src/hooks/use-url-selection.test.tsx`

- [ ] **Step 4.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```

- [ ] **Step 4.2: Write the failing test**

Create `src/hooks/use-url-selection.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { MemoryRouter } from "react-router";
import { useSetIdParam, usePokedexParam } from "./use-url-selection";

function SetIdProbe() {
	const [setId, setSetId] = useSetIdParam();
	return (
		<>
			<span data-testid="value">{setId ?? "null"}</span>
			<button type="button" onClick={() => setSetId("swsh4")}>set</button>
			<button type="button" onClick={() => setSetId(null)}>clear</button>
		</>
	);
}

function PokedexProbe() {
	const [dex, setDex] = usePokedexParam();
	return (
		<>
			<span data-testid="value">{dex === null ? "null" : String(dex)}</span>
			<button type="button" onClick={() => setDex(25)}>set</button>
			<button type="button" onClick={() => setDex(null)}>clear</button>
		</>
	);
}

function renderInRouter(ui: React.ReactElement, initialUrl: string) {
	return render(<MemoryRouter initialEntries={[initialUrl]}>{ui}</MemoryRouter>);
}

describe("useSetIdParam", () => {
	test("reads existing setId from URL", () => {
		renderInRouter(<SetIdProbe />, "/?setId=base1");
		expect(screen.getByTestId("value").textContent).toBe("base1");
	});

	test("returns null when setId is absent", () => {
		renderInRouter(<SetIdProbe />, "/");
		expect(screen.getByTestId("value").textContent).toBe("null");
	});

	test("setSetId writes to URL", () => {
		renderInRouter(<SetIdProbe />, "/");
		fireEvent.click(screen.getByText("set"));
		expect(screen.getByTestId("value").textContent).toBe("swsh4");
	});

	test("setSetId(null) clears the param", () => {
		renderInRouter(<SetIdProbe />, "/?setId=base1");
		fireEvent.click(screen.getByText("clear"));
		expect(screen.getByTestId("value").textContent).toBe("null");
	});
});

describe("usePokedexParam", () => {
	test("reads existing dex from URL as a number", () => {
		renderInRouter(<PokedexProbe />, "/?dex=25");
		expect(screen.getByTestId("value").textContent).toBe("25");
	});

	test("returns null for missing param", () => {
		renderInRouter(<PokedexProbe />, "/");
		expect(screen.getByTestId("value").textContent).toBe("null");
	});

	test("returns null for non-numeric dex", () => {
		renderInRouter(<PokedexProbe />, "/?dex=pikachu");
		expect(screen.getByTestId("value").textContent).toBe("null");
	});

	test("setDex writes the number to URL", () => {
		renderInRouter(<PokedexProbe />, "/");
		fireEvent.click(screen.getByText("set"));
		expect(screen.getByTestId("value").textContent).toBe("25");
	});

	test("setDex(null) clears the param", () => {
		renderInRouter(<PokedexProbe />, "/?dex=25");
		fireEvent.click(screen.getByText("clear"));
		expect(screen.getByTestId("value").textContent).toBe("null");
	});
});
```

- [ ] **Step 4.3: Run the test, expect failure**

```bash
bun test src/hooks/use-url-selection.test.tsx
```
Expected: FAIL with "Cannot find module './use-url-selection'".

- [ ] **Step 4.4: Implement the hooks**

Create `src/hooks/use-url-selection.ts`:

```ts
import { useSearchParams } from "react-router";

interface UpdateOptions {
	/** When true, replaces the current history entry instead of pushing a new one. */
	replace?: boolean;
}

type SetSetId = (id: string | null, opts?: UpdateOptions) => void;
type SetDex = (n: number | null, opts?: UpdateOptions) => void;

/**
 * URL-backed selection for the By-Set view. Reads/writes the `setId`
 * search parameter. Pass `{ replace: true }` for non-user-driven updates
 * (e.g. default-fallback selection on first load) to avoid polluting
 * back history.
 */
export function useSetIdParam(): [string | null, SetSetId] {
	const [params, setParams] = useSearchParams();
	const setId = params.get("setId");
	const setSetId: SetSetId = (id, opts) => {
		const next = new URLSearchParams(params);
		if (id) next.set("setId", id);
		else next.delete("setId");
		setParams(next, opts?.replace ? { replace: true } : undefined);
	};
	return [setId, setSetId];
}

/**
 * URL-backed selection for the By-Pokémon view. Reads/writes the `dex`
 * search parameter as a number. Returns null for missing or non-numeric
 * values.
 */
export function usePokedexParam(): [number | null, SetDex] {
	const [params, setParams] = useSearchParams();
	const raw = params.get("dex");
	const parsed = raw === null ? null : Number.parseInt(raw, 10);
	const dex = parsed !== null && Number.isFinite(parsed) ? parsed : null;
	const setDex: SetDex = (n, opts) => {
		const next = new URLSearchParams(params);
		if (n !== null && Number.isFinite(n)) next.set("dex", String(n));
		else next.delete("dex");
		setParams(next, opts?.replace ? { replace: true } : undefined);
	};
	return [dex, setDex];
}
```

- [ ] **Step 4.5: Run the test, expect pass**

```bash
bun test src/hooks/use-url-selection.test.tsx
```
Expected: 9 pass, 0 fail.

- [ ] **Step 4.6: Run full suite to confirm nothing broke**

```bash
bun test && bun run typecheck && bun run lint
```

- [ ] **Step 4.7: Commit**

```bash
git add src/hooks/use-url-selection.ts src/hooks/use-url-selection.test.tsx
git commit -m "feat(hooks): add useSetIdParam + usePokedexParam URL hooks

Reads and writes the setId/dex search params with an optional
replace-history flag for non-user-driven updates."
```

---

## Task 5: Migrate `SetsPage` to URL hooks

**Files:**
- Modify: `src/pages/sets-page.tsx`

This task changes the source of selection from Zustand to URL but does NOT yet add the cross-link overlay (Task 10 does that).

- [ ] **Step 5.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```

- [ ] **Step 5.2: Update `sets-page.tsx`**

Replace the contents of `src/pages/sets-page.tsx` with:

```tsx
import { useEffect, useMemo } from "react";
import { getCardsBySet } from "../api";
import { CardGrid } from "../components/card-grid";
import { Header } from "../components/header";
import { SeriesTabs } from "../components/series-tabs";
import { SetTabs } from "../components/set-tabs";
import { useCards } from "../hooks/use-cards";
import { useSets } from "../hooks/use-sets";
import { useSetIdParam } from "../hooks/use-url-selection";

export function SetsPage() {
	const sets = useSets();
	const [selectedSetId, setSelectedSetId] = useSetIdParam();
	const { cards, loading, loadMore } = useCards(selectedSetId, getCardsBySet);

	useEffect(() => {
		if (sets.length === 0) return;
		// If nothing is selected yet, or the URL setId points to a set that no
		// longer exists (e.g. removed from the API), fall back to the newest
		// set. Use replace:true so this default doesn't litter back history.
		const exists = selectedSetId && sets.some((s) => s.id === selectedSetId);
		if (!exists) {
			setSelectedSetId(sets[0].id, { replace: true });
		}
	}, [sets, selectedSetId, setSelectedSetId]);

	const currentSet = sets.find((s) => s.id === selectedSetId);

	const distinctSeries = useMemo(() => {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const s of sets) {
			if (!seen.has(s.series)) {
				seen.add(s.series);
				result.push(s.series);
			}
		}
		return result;
	}, [sets]);

	const selectedSeries = currentSet?.series ?? null;
	const setsInSeries = useMemo(
		() =>
			selectedSeries ? sets.filter((s) => s.series === selectedSeries) : [],
		[sets, selectedSeries],
	);

	function selectSeries(series: string) {
		if (series === selectedSeries) return;
		const firstInSeries = sets.find((s) => s.series === series);
		if (firstInSeries) setSelectedSetId(firstInSeries.id);
	}

	return (
		<>
			<Header currentSet={currentSet} />
			<SeriesTabs
				series={distinctSeries}
				selected={selectedSeries}
				onSelect={selectSeries}
			/>
			<SetTabs
				sets={setsInSeries}
				selectedSetId={selectedSetId}
				seriesLabel={selectedSeries}
				onSelect={setSelectedSetId}
			/>
			<CardGrid setId={selectedSetId} cards={cards} onEndReached={loadMore} />
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
```

The diff vs. the current file: imports change (`useStore` → `useSetIdParam`); `selectedSetId`/`setSelectedSetId` come from the hook; the default-fallback effect now uses `{ replace: true }`. Functionally identical otherwise.

- [ ] **Step 5.3: Verify SetsPage still typechecks**

```bash
bun run typecheck
```
Expected: zero errors. The TypeScript compiler will flag if `setSelectedSetId(...)` signature mismatches; the URL hook returns the same `(id: string | null) => void` shape (with optional opts), so existing call sites in `SetTabs` keep working.

- [ ] **Step 5.4: Verify lint and tests**

```bash
bun run lint && bun test
```

- [ ] **Step 5.5: Commit**

```bash
git add src/pages/sets-page.tsx
git commit -m "refactor(sets-page): selection from URL instead of Zustand

useSetIdParam replaces useStore. Default-fallback uses replace:true so
the auto-select doesn't push a history entry."
```

---

## Task 6: Migrate `PokemonPage` to URL hooks

**Files:**
- Modify: `src/pages/pokemon-page.tsx`

- [ ] **Step 6.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```

- [ ] **Step 6.2: Update `pokemon-page.tsx`**

Replace the contents of `src/pages/pokemon-page.tsx` with:

```tsx
import { useCallback } from "react";
import { getCardsByPokedexNumber } from "../api";
import { CardGrid } from "../components/card-grid";
import "../components/header.css";
import { PokemonFilter } from "../components/pokemon-filter";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { usePokedexParam } from "../hooks/use-url-selection";
import "./pokemon-page.css";

// useCards keys by string, but the conceptual key here is a pokédex number.
// Stringifying at the boundary keeps the cache key human-readable in devtools.
const fetcher: CardFetcher = (key, page, pageSize) =>
	getCardsByPokedexNumber(Number(key), page, pageSize);

export function PokemonPage() {
	const [pokedexNumber, setPokedexNumber] = usePokedexParam();
	const key = pokedexNumber === null ? null : String(pokedexNumber);
	const { cards, loading, loadMore } = useCards(key, fetcher);

	const handleEndReached = useCallback((k: string) => loadMore(k), [loadMore]);

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
				</div>
			</header>
			<PokemonFilter value={pokedexNumber} onChange={setPokedexNumber} />
			<CardGrid setId={key} cards={cards} onEndReached={handleEndReached} />
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
```

The diff: imports change (`useStore` → `usePokedexParam`); the destructured tuple from the hook replaces the two `useStore` calls.

- [ ] **Step 6.3: Verify typecheck + lint + tests**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: clean. PokemonFilter accepts `(value, onChange)` so the swap is direct.

- [ ] **Step 6.4: Commit**

```bash
git add src/pages/pokemon-page.tsx
git commit -m "refactor(pokemon-page): selection from URL instead of Zustand

usePokedexParam replaces useStore. The page becomes deterministic from
its URL — /pokemon?dex=25 directly selects Pikachu on first load."
```

---

## Task 7: Drop URL fields from Zustand `UISlice` + bump storage version

**Files:**
- Modify: `src/store/ui-slice.ts` (becomes effectively empty — delete the file)
- Modify: `src/store/index.ts`

After Tasks 5 and 6, nothing imports `useStore` for `selectedSetId` / `selectedPokedexNumber` / their setters. The slice has no other fields and is now dead code.

- [ ] **Step 7.1: Verify nothing references the removed selectors**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1
grep -rn "selectedSetId\|selectedPokedexNumber\|setSelectedSetId\|setSelectedPokedexNumber" src/ --include="*.ts" --include="*.tsx"
```
Expected: only matches inside `src/store/ui-slice.ts` and `src/store/index.ts`. If you see any in `src/pages/` or elsewhere, that's a leftover from Tasks 5/6 that needs to be fixed before proceeding.

- [ ] **Step 7.2: Delete `src/store/ui-slice.ts`**

```bash
rm /Users/rin/GitHub/pokemon-tcg-viewer-phase-1/src/store/ui-slice.ts
```

- [ ] **Step 7.3: Update `src/store/index.ts`**

Replace the contents with:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type ApiCacheSlice, createApiCacheSlice } from "./api-cache-slice";

type AppStore = ApiCacheSlice;

// Bump if the persisted shape changes in a non-additive way and you want to
// drop old data instead of writing a migration. Bumping for Phase 1 to drop
// the now-stale selectedSetId / selectedPokedexNumber values from anyone who
// used Phase 0 with localStorage selection.
const STORAGE_VERSION = 2;

export const useStore = create<AppStore>()(
	persist(createApiCacheSlice, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
		// Only mirror these fields to localStorage. Loading/in-flight flags and
		// any future ephemeral state stay in memory. Page selection now lives
		// in the URL, not here.
		partialize: (state) => ({
			sets: state.sets,
			setsFetchedAt: state.setsFetchedAt,
			pokemonList: state.pokemonList,
			pokemonListFetchedAt: state.pokemonListFetchedAt,
		}),
	}),
);
```

- [ ] **Step 7.4: Verify typecheck**

```bash
bun run typecheck
```
Expected: zero errors. (`UISlice` is no longer imported anywhere.)

- [ ] **Step 7.5: Verify lint and tests**

```bash
bun run lint && bun test
```

- [ ] **Step 7.6: Run the dev server briefly to confirm the app boots**

```bash
bun run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:5173/pokemon-tcg-viewer/ -o /dev/null -w "%{http_code}\n"
kill $DEV_PID
wait $DEV_PID 2>/dev/null
```
Expected: `200`. (No assertions about the rendered page — that's manual.)

- [ ] **Step 7.7: Commit**

```bash
git add src/store/index.ts src/store/ui-slice.ts
git commit -m "refactor(store): remove UISlice now that URL holds selection

Selection moved to URL search params in Tasks 5-6. UISlice had no other
fields, so the file is removed entirely. STORAGE_VERSION bumped to 2 so
Phase 0 users' stale selection data is discarded cleanly on first load."
```

---

## Task 8: Build `<CrossLinkOverlay>` component (TDD)

**Files:**
- Create: `src/components/cross-link-overlay/index.ts`
- Create: `src/components/cross-link-overlay/cross-link-overlay.tsx`
- Test: `src/components/cross-link-overlay/cross-link-overlay.test.tsx`
- Create: `src/components/cross-link-overlay/cross-link-overlay.css`

- [ ] **Step 8.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```

- [ ] **Step 8.2: Write the failing test**

Create `src/components/cross-link-overlay/cross-link-overlay.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { MemoryRouter } from "react-router";
import { CrossLinkOverlay } from "./cross-link-overlay";

function renderInRouter(ui: React.ReactElement) {
	return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("<CrossLinkOverlay />", () => {
	test("renders nothing when given an empty links array", () => {
		const { container } = renderInRouter(<CrossLinkOverlay links={[]} />);
		expect(container.firstChild).toBeNull();
	});

	test("renders a single link with correct label and href", () => {
		renderInRouter(
			<CrossLinkOverlay
				links={[{ label: "View all Pikachu", to: "/pokemon?dex=25" }]}
			/>,
		);
		const link = screen.getByRole("link", { name: /pikachu/i });
		expect(link.getAttribute("href")).toBe("/pokemon?dex=25");
	});

	test("renders multiple stacked links for multi-Pokémon cards", () => {
		renderInRouter(
			<CrossLinkOverlay
				links={[
					{ label: "View all Pikachu", to: "/pokemon?dex=25" },
					{ label: "View all Zekrom", to: "/pokemon?dex=644" },
				]}
			/>,
		);
		expect(screen.getByRole("link", { name: /pikachu/i })).toBeDefined();
		expect(screen.getByRole("link", { name: /zekrom/i })).toBeDefined();
	});

	test("each link is keyboard-focusable", () => {
		renderInRouter(
			<CrossLinkOverlay
				links={[{ label: "Go to Crown Zenith", to: "/?setId=swsh12pt5" }]}
			/>,
		);
		const link = screen.getByRole("link");
		expect(link.getAttribute("href")).toBe("/?setId=swsh12pt5");
		// react-router <Link> renders an <a> with href; default tabIndex is 0
		// for anchor elements with href, so explicit tabIndex isn't needed.
		expect(link.tagName).toBe("A");
	});
});
```

- [ ] **Step 8.3: Run the test, expect failure**

```bash
bun test src/components/cross-link-overlay/cross-link-overlay.test.tsx
```
Expected: FAIL with module-not-found.

- [ ] **Step 8.4: Implement `cross-link-overlay.tsx`**

Create `src/components/cross-link-overlay/cross-link-overlay.tsx`:

```tsx
import { Link } from "react-router";
import "./cross-link-overlay.css";

export interface CrossLink {
	label: string;
	to: string;
}

interface CrossLinkOverlayProps {
	links: CrossLink[];
}

/**
 * Hover-overlay payload rendered inside <HoloCard hoverOverlay={…} />.
 * Each link navigates somewhere that re-anchors the page (set or
 * Pokémon view). Returns null when there are no links so callers can
 * safely pass an empty array for cards without cross-link targets
 * (Trainers, Energies).
 */
export function CrossLinkOverlay({ links }: CrossLinkOverlayProps) {
	if (links.length === 0) return null;
	return (
		<div className="cross-link-overlay">
			{links.map((link) => (
				<Link key={link.to} to={link.to} className="cross-link-overlay-link">
					<span className="cross-link-overlay-arrow" aria-hidden="true">
						→
					</span>
					{link.label}
				</Link>
			))}
		</div>
	);
}
```

- [ ] **Step 8.5: Create the CSS file**

Create `src/components/cross-link-overlay/cross-link-overlay.css`:

```css
/*
 * Hover overlay shown by HoloCard.hoverOverlay slot. Positioned by the
 * parent .holo-card-overlay rule (top-right of card). This file owns
 * its own visuals: a small dark pill with backdrop-blur, stacked link
 * rows.
 */

.cross-link-overlay {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 0.5rem 0.75rem;
	background: rgba(0, 0, 0, 0.6);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	border-radius: 8px;
	color: #fff;
	font-size: 0.85rem;
	line-height: 1.2;
	max-width: 16rem;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.cross-link-overlay-link {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	color: #fff;
	text-decoration: none;
	padding: 0.25rem 0.4rem;
	border-radius: 4px;
	transition: background 0.12s ease-out;
}

.cross-link-overlay-link:hover,
.cross-link-overlay-link:focus-visible {
	background: rgba(255, 255, 255, 0.12);
	outline: none;
}

.cross-link-overlay-arrow {
	font-size: 0.9em;
	opacity: 0.8;
}
```

- [ ] **Step 8.6: Create the index module**

Create `src/components/cross-link-overlay/index.ts`:

```ts
export { CrossLinkOverlay, type CrossLink } from "./cross-link-overlay";
```

- [ ] **Step 8.7: Run tests, expect pass**

```bash
bun test src/components/cross-link-overlay/
```
Expected: 4 pass, 0 fail.

- [ ] **Step 8.8: Verify typecheck and lint**

```bash
bun run typecheck && bun run lint
```
Expected: zero errors. Pre-existing `card-grid.css !important` warning OK.

- [ ] **Step 8.9: Commit**

```bash
git add src/components/cross-link-overlay/
git commit -m "feat(cross-link-overlay): add hover-overlay component

Renders into HoloCard.hoverOverlay slot. Returns null for empty links so
trainer/energy cards (no pokédex numbers) opt out cleanly without
caller-side conditionals."
```

---

## Task 9: Add `renderOverlay` prop to `<CardGrid>`

**Files:**
- Modify: `src/components/card-grid.tsx`

- [ ] **Step 9.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```

- [ ] **Step 9.2: Update `card-grid.tsx`**

Replace the contents of `src/components/card-grid.tsx` with:

```tsx
import React from "react";
import { type GridComponents, VirtuosoGrid } from "react-virtuoso";
import { HoloCard, type HoloCardData } from "./holo-card";
import "./card-grid.css";

const GridList: NonNullable<GridComponents["List"]> = React.forwardRef(
	({ children, className, style }, ref) => (
		<div
			ref={ref}
			style={style}
			className={["grid-list", className].filter(Boolean).join(" ")}
		>
			{children}
		</div>
	),
);

const GridItem: NonNullable<GridComponents["Item"]> = ({
	children,
	className,
	style,
	...rest
}) => (
	<div
		{...rest}
		style={style}
		className={["grid-item", className].filter(Boolean).join(" ")}
	>
		{children}
	</div>
);

const gridComponents: GridComponents = { List: GridList, Item: GridItem };

interface CardGridProps {
	setId: string | null;
	cards: HoloCardData[];
	onEndReached: (setId: string) => void;
	renderOverlay?: (card: HoloCardData) => React.ReactNode;
}

export function CardGrid({
	setId,
	cards,
	onEndReached,
	renderOverlay,
}: CardGridProps) {
	return (
		<VirtuosoGrid
			key={setId ?? "empty"}
			className="grid"
			data={cards}
			endReached={() => {
				if (setId) onEndReached(setId);
			}}
			increaseViewportBy={400}
			components={gridComponents}
			itemContent={(_, card) => (
				<HoloCard
					imageUrl={card.imageUrl}
					name={card.name}
					rarity={card.rarity}
					subtypes={card.subtypes}
					supertype={card.supertype}
					setId={card.setId}
					cardNumber={card.cardNumber}
					hoverOverlay={renderOverlay?.(card)}
					style={{ width: 300 }}
				/>
			)}
		/>
	);
}
```

The diff: a new optional `renderOverlay` prop. When defined, its return value is passed to `HoloCard.hoverOverlay`. When omitted (existing call sites), `renderOverlay?.(card)` returns `undefined`, so `hoverOverlay` is undefined and the overlay div is empty (already handled by Phase 0 CSS).

- [ ] **Step 9.3: Verify typecheck + lint + tests**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 17 existing tests + 4 cross-link tests + 9 url-selection tests + 4 pokemon-name tests + 3 display-name tests = 37 tests, 0 fail.

- [ ] **Step 9.4: Commit**

```bash
git add src/components/card-grid.tsx
git commit -m "feat(card-grid): add renderOverlay slot

Optional callback that produces the hoverOverlay node per card. Pages
construct page-specific overlays (cross-mode links). Backward-compatible:
omitting the prop yields the same empty-overlay behavior as before."
```

---

## Task 10: Wire `SetsPage` to render cross-link overlay

**Files:**
- Modify: `src/pages/sets-page.tsx`

- [ ] **Step 10.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```

- [ ] **Step 10.2: Update `sets-page.tsx`**

Replace the contents of `src/pages/sets-page.tsx` with:

```tsx
import { useEffect, useMemo } from "react";
import type { HoloCardData } from "../components/holo-card";
import { getCardsBySet } from "../api";
import { CardGrid } from "../components/card-grid";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import { Header } from "../components/header";
import { SeriesTabs } from "../components/series-tabs";
import { SetTabs } from "../components/set-tabs";
import { useCards } from "../hooks/use-cards";
import { usePokemonList } from "../hooks/use-pokemon-list";
import { useSets } from "../hooks/use-sets";
import { useSetIdParam } from "../hooks/use-url-selection";
import { pokemonNameByDex } from "../utils/pokemon-name";

export function SetsPage() {
	const sets = useSets();
	const pokemonList = usePokemonList();
	const [selectedSetId, setSelectedSetId] = useSetIdParam();
	const { cards, loading, loadMore } = useCards(selectedSetId, getCardsBySet);

	useEffect(() => {
		if (sets.length === 0) return;
		const exists = selectedSetId && sets.some((s) => s.id === selectedSetId);
		if (!exists) {
			setSelectedSetId(sets[0].id, { replace: true });
		}
	}, [sets, selectedSetId, setSelectedSetId]);

	const currentSet = sets.find((s) => s.id === selectedSetId);

	const distinctSeries = useMemo(() => {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const s of sets) {
			if (!seen.has(s.series)) {
				seen.add(s.series);
				result.push(s.series);
			}
		}
		return result;
	}, [sets]);

	const selectedSeries = currentSet?.series ?? null;
	const setsInSeries = useMemo(
		() =>
			selectedSeries ? sets.filter((s) => s.series === selectedSeries) : [],
		[sets, selectedSeries],
	);

	function selectSeries(series: string) {
		if (series === selectedSeries) return;
		const firstInSeries = sets.find((s) => s.series === series);
		if (firstInSeries) setSelectedSetId(firstInSeries.id);
	}

	function renderOverlay(card: HoloCardData) {
		const dexNums = card.nationalPokedexNumbers ?? [];
		if (dexNums.length === 0) return null;
		const links = dexNums.map((n) => ({
			label: `View all ${pokemonNameByDex(pokemonList, n) ?? `#${n}`}`,
			to: `/pokemon?dex=${n}`,
		}));
		return <CrossLinkOverlay links={links} />;
	}

	return (
		<>
			<Header currentSet={currentSet} />
			<SeriesTabs
				series={distinctSeries}
				selected={selectedSeries}
				onSelect={selectSeries}
			/>
			<SetTabs
				sets={setsInSeries}
				selectedSetId={selectedSetId}
				seriesLabel={selectedSeries}
				onSelect={setSelectedSetId}
			/>
			<CardGrid
				setId={selectedSetId}
				cards={cards}
				onEndReached={loadMore}
				renderOverlay={renderOverlay}
			/>
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
```

The new pieces: `usePokemonList` to look up names, `pokemonNameByDex` import, `CrossLinkOverlay` import, the `renderOverlay` function, and passing it to `CardGrid`.

- [ ] **Step 10.3: Verify typecheck + lint + tests**

```bash
bun run typecheck && bun run lint && bun test
```

- [ ] **Step 10.4: Commit**

```bash
git add src/pages/sets-page.tsx
git commit -m "feat(sets-page): render cross-link overlay with pokémon links

Each card gets one /pokemon?dex=N link per nationalPokedexNumber. Empty
arrays (Trainers, Energies) return null and no overlay shows. Pokémon
name resolves via pokemonNameByDex; falls back to '#NN' until the
list loads."
```

---

## Task 11: Wire `PokemonPage` to render cross-link overlay

**Files:**
- Modify: `src/pages/pokemon-page.tsx`

- [ ] **Step 11.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```

- [ ] **Step 11.2: Update `pokemon-page.tsx`**

Replace the contents of `src/pages/pokemon-page.tsx` with:

```tsx
import { useCallback } from "react";
import type { HoloCardData } from "../components/holo-card";
import { getCardsByPokedexNumber } from "../api";
import { CardGrid } from "../components/card-grid";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import "../components/header.css";
import { PokemonFilter } from "../components/pokemon-filter";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { usePokedexParam } from "../hooks/use-url-selection";
import "./pokemon-page.css";

// useCards keys by string, but the conceptual key here is a pokédex number.
// Stringifying at the boundary keeps the cache key human-readable in devtools.
const fetcher: CardFetcher = (key, page, pageSize) =>
	getCardsByPokedexNumber(Number(key), page, pageSize);

function renderOverlay(card: HoloCardData) {
	return (
		<CrossLinkOverlay
			links={[{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` }]}
		/>
	);
}

export function PokemonPage() {
	const [pokedexNumber, setPokedexNumber] = usePokedexParam();
	const key = pokedexNumber === null ? null : String(pokedexNumber);
	const { cards, loading, loadMore } = useCards(key, fetcher);

	const handleEndReached = useCallback((k: string) => loadMore(k), [loadMore]);

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
				</div>
			</header>
			<PokemonFilter value={pokedexNumber} onChange={setPokedexNumber} />
			<CardGrid
				setId={key}
				cards={cards}
				onEndReached={handleEndReached}
				renderOverlay={renderOverlay}
			/>
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
```

The diff vs. Task 6: imports gain `HoloCardData`, `CrossLinkOverlay`; a top-level `renderOverlay` function (one link per card going to its set); `renderOverlay` passed to `CardGrid`. The function is module-level (not inside the component) because it's pure and capture-free — no need for `useCallback`.

- [ ] **Step 11.3: Verify typecheck + lint + tests**

```bash
bun run typecheck && bun run lint && bun test
```

- [ ] **Step 11.4: Commit**

```bash
git add src/pages/pokemon-page.tsx
git commit -m "feat(pokemon-page): render cross-link overlay with set link

Each card gets a 'Go to <Set Name>' link → /?setId=X. setName is
already in HoloCardData (Task 3)."
```

---

## Task 12: Add `<ScrollRestoration />` to the app root

**Files:**
- Modify: `src/app.tsx`

- [ ] **Step 12.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```

- [ ] **Step 12.2: Update `app.tsx`**

Replace the contents of `src/app.tsx` with:

```tsx
import { NavLink, Route, Routes, ScrollRestoration } from "react-router";
import "./app.css";
import { PokemonPage } from "./pages/pokemon-page";
import { SetsPage } from "./pages/sets-page";

export default function App() {
	return (
		<div className="app">
			<ScrollRestoration />
			<nav className="primary-nav" aria-label="Filter mode">
				<NavLink
					to="/"
					end
					className={({ isActive }) =>
						isActive ? "primary-nav-link active" : "primary-nav-link"
					}
				>
					By Set
				</NavLink>
				<NavLink
					to="/pokemon"
					className={({ isActive }) =>
						isActive ? "primary-nav-link active" : "primary-nav-link"
					}
				>
					By Pokémon
				</NavLink>
			</nav>
			<Routes>
				<Route path="/" element={<SetsPage />} />
				<Route path="/pokemon" element={<PokemonPage />} />
			</Routes>
		</div>
	);
}
```

The diff: import adds `ScrollRestoration`; the JSX adds `<ScrollRestoration />` as the first child inside the `.app` div.

- [ ] **Step 12.3: Verify typecheck + lint + tests + build**

```bash
bun run typecheck && bun run lint && bun test && bun run build
```
Expected: all clean. ScrollRestoration is part of `react-router` already in deps.

- [ ] **Step 12.4: Commit**

```bash
git add src/app.tsx
git commit -m "feat(app): add ScrollRestoration for back/forward navigation

Browser back/forward now restores scroll position per URL. Especially
relevant for cross-mode linking — clicking a card in one view, then
hitting back, returns to the previous scroll position."
```

---

## Task 13: Final verification suite

**Files:** none (read-only verification)

- [ ] **Step 13.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-phase-1 && pwd && git branch --show-current
```

- [ ] **Step 13.2: Run all checks**

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
Expected: ~37 pass / 0 fail. Phase 0's 17 + new tests added in this plan: 3 (display-name) + 4 (pokemon-name) + 9 (url-selection) + 4 (cross-link-overlay) = 20. Total 37.

```bash
bun run build
```
Expected: success. Bundle size should be very close to Phase 0 (no big new deps; ScrollRestoration is already in `react-router`).

- [ ] **Step 13.3: Manual smoke test in dev**

Start the dev server and verify the new behavior end-to-end:

```bash
bun run dev
```

In a browser:

1. Navigate to `http://localhost:5173/pokemon-tcg-viewer/` — should land on the By-Set view, default to the latest set (URL becomes `/?setId=...`).
2. Hover a Pokémon card. The cross-link overlay should appear with a "View all <Pokemon>" link.
3. Click the link. URL becomes `/pokemon?dex=N`, view switches to By-Pokémon, all printings of that Pokémon appear.
4. Hover any card on the Pokémon view. Overlay should show "Go to <Set Name>" link.
5. Click the set link. URL becomes `/?setId=...`, view switches back to By-Set with that set selected.
6. Hit browser back. Should return to the Pokémon view at the previous scroll position.
7. Hover a Trainer or Energy card (e.g. "Boss's Orders" in Sword & Shield Black Star Promos). No overlay should appear.
8. Find a multi-Pokémon card (e.g. some Pikachu & Zekrom-GX or Reshiram & Charizard-GX). Two stacked links should appear.
9. Reload the page directly at `/pokemon?dex=25`. Should immediately show Pikachu's printings without needing to interact with the search box.
10. Reload directly at `/?setId=swsh12pt5` (Crown Zenith). Should immediately select Crown Zenith.

If any step doesn't behave as expected, debug, file the fix, and commit. If smoke test passes, no commit needed.

- [ ] **Step 13.4: Console-clean check**

While the dev server is running, open the browser console. Browse a few cards and confirm:
- No `[holo-card] Unknown rarity` warnings (Phase 0 invariant).
- No errors from React Router (URL state should round-trip cleanly).
- No errors from the Pokémon TCG API.

If new warnings appear that weren't in Phase 0, investigate before continuing.

- [ ] **Step 13.5: Update spec status**

Edit `docs/superpowers/specs/2026-05-03-phase-1-cross-mode-linking-design.md`. Change the frontmatter line:
```markdown
**Status:** Approved (design)
```
to:
```markdown
**Status:** Implemented
```

```bash
git add docs/superpowers/specs/2026-05-03-phase-1-cross-mode-linking-design.md
git commit -m "docs: mark Phase 1 cross-mode linking spec as implemented"
```

---

## Done criteria

- [ ] All Phase 1 tasks (1–13) above are checked off.
- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` all pass.
- [ ] Manual smoke test (Step 13.3) passes — both directions of cross-linking work, multi-Pokémon cards stack, trainers/energies have no overlay, browser back works.
- [ ] Spec status reads "Implemented".

# Phase 1 / #5 — Advanced Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-03-phase-1-advanced-filters-design.md](../specs/2026-05-03-phase-1-advanced-filters-design.md)

**Goal:** Add a persistent filter chip row to both browse pages with four URL-backed multi-select dimensions (type, rarity, supertype, subtype), composing with the existing primary set / pokédex selection.

**Architecture:** Filter values fetched from four pokemontcg.io `/v2/...` endpoints and cached in Zustand alongside existing data (purely additive — no `STORAGE_VERSION` bump). A generic `useFilterParam(name)` URL hook reads/writes comma-separated values from search params. A `buildFilterClauses` helper composes pokemontcg.io query syntax. New `<FilterChipRow>` + `<FilterChip>` components render into both pages between the existing tabs and the card grid. Pages compose a deterministic cache key from their primary selection plus a filter signature so changes to filters invalidate `useCards`'s cache cleanly.

**Tech Stack:** React 19 + React Router 7, TypeScript, Vite 8, Bun (package + test), Biome, happy-dom + @testing-library/react.

---

## File map

**Create:**
- `src/utils/build-filter-clauses.ts` — pure helper composing query clauses
- `src/utils/build-filter-clauses.test.ts`
- `src/hooks/use-filter-values.ts` — fetches + returns the four dimension lists
- `src/hooks/use-filter-values.test.tsx`
- `src/components/filter-chip-row/index.ts`
- `src/components/filter-chip-row/filter-chip-row.tsx`
- `src/components/filter-chip-row/filter-chip-row.test.tsx`
- `src/components/filter-chip-row/filter-chip.tsx`
- `src/components/filter-chip-row/filter-chip.test.tsx`
- `src/components/filter-chip-row/filter-chip-row.css`

**Modify:**
- `src/api.ts` — add `getTypes` / `getSubtypes` / `getSupertypes` / `getRarities`; add optional `filters` parameter to `getCardsBySet` / `getCardsByPokedexNumber`
- `src/store/freshness.ts` — extend `kind` union to include `"filterValues"`
- `src/store/api-cache-slice.ts` — add filter-value caches + `loadX` actions
- `src/store/index.ts` — extend `partialize` to mirror new fields (no version bump)
- `src/hooks/use-url-selection.ts` — add `useFilterParam(name)` hook
- `src/hooks/use-url-selection.test.tsx` — add tests for `useFilterParam`
- `src/pages/sets-page.tsx` — render `<FilterChipRow>`, compose filter-aware cache key, pass filters to `getCardsBySet`
- `src/pages/pokemon-page.tsx` — same for the Pokémon page

---

## Task 1: `useFilterParam` URL hook

**Files:**
- Modify: `src/hooks/use-url-selection.ts`
- Test: `src/hooks/use-url-selection.test.tsx`

- [ ] **Step 1.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```
Expected: worktree path + `phase-1/advanced-filters`. STOP and report BLOCKED otherwise.

- [ ] **Step 1.2: Write the failing test**

In `src/hooks/use-url-selection.test.tsx`, add the following inside the existing top-level imports section if not already present (Biome will sort):

```tsx
import { useFilterParam } from "./use-url-selection";
```

Then add a new probe at the top of the file (next to the existing `SetIdProbe` and `PokedexProbe` probes):

```tsx
function FilterProbe({ name }: { name: string }) {
	const [values, setValues] = useFilterParam(name);
	return (
		<>
			<span data-testid="value">{values.join(",") || "empty"}</span>
			<button type="button" onClick={() => setValues(["fire"])}>set-one</button>
			<button type="button" onClick={() => setValues(["fire", "water"])}>set-two</button>
			<button type="button" onClick={() => setValues([])}>clear</button>
		</>
	);
}
```

Then add a new `describe` block at the bottom of the file:

```tsx
describe("useFilterParam", () => {
	test("reads existing CSV values from URL", () => {
		renderInRouter(<FilterProbe name="types" />, "/?types=fire,water");
		expect(screen.getByTestId("value").textContent).toBe("fire,water");
	});

	test("returns empty array when param is absent", () => {
		renderInRouter(<FilterProbe name="types" />, "/");
		expect(screen.getByTestId("value").textContent).toBe("empty");
	});

	test("setValues writes comma-separated to URL", () => {
		renderInRouter(<FilterProbe name="types" />, "/");
		fireEvent.click(screen.getByText("set-two"));
		expect(screen.getByTestId("value").textContent).toBe("fire,water");
	});

	test("setValues with empty array clears the param", () => {
		renderInRouter(<FilterProbe name="types" />, "/?types=fire,water");
		fireEvent.click(screen.getByText("clear"));
		expect(screen.getByTestId("value").textContent).toBe("empty");
	});

	test("filters out empty CSV components (e.g. trailing comma)", () => {
		renderInRouter(<FilterProbe name="types" />, "/?types=fire,,water,");
		expect(screen.getByTestId("value").textContent).toBe("fire,water");
	});
});
```

- [ ] **Step 1.3: Run the failing test**

```bash
bun test src/hooks/use-url-selection.test.tsx
```
Expected: FAIL with "useFilterParam is not exported" or similar.

- [ ] **Step 1.4: Implement the hook**

Append to `src/hooks/use-url-selection.ts` (after `usePokedexParam`):

```ts
type SetFilter = (vals: string[], opts?: UpdateOptions) => void;

/**
 * Generic multi-value URL search-param hook for filter dimensions.
 * Stores values comma-separated under `name`. Empty array clears the
 * param. Empty CSV components (e.g. from a stray trailing comma) are
 * filtered out on read.
 */
export function useFilterParam(name: string): [string[], SetFilter] {
	const [params, setParams] = useSearchParams();
	const raw = params.get(name);
	const values = raw ? raw.split(",").filter(Boolean) : [];
	const setValues: SetFilter = (vals, opts) => {
		const next = new URLSearchParams(params);
		if (vals.length === 0) next.delete(name);
		else next.set(name, vals.join(","));
		setParams(next, opts?.replace ? { replace: true } : undefined);
	};
	return [values, setValues];
}
```

- [ ] **Step 1.5: Run tests to confirm pass**

```bash
bun test src/hooks/use-url-selection.test.tsx
```
Expected: 14 pass (9 existing setId/dex tests + 5 new filter tests), 0 fail.

- [ ] **Step 1.6: Verify everything else still works**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 47 total tests pass (42 baseline + 5 new), typecheck clean, lint with only the pre-existing `card-grid.css !important` warning.

- [ ] **Step 1.7: Commit**

```bash
git add src/hooks/use-url-selection.ts src/hooks/use-url-selection.test.tsx
git commit -m "feat(hooks): add useFilterParam for multi-value URL search params

Generic hook for filter dimensions: comma-separated values under a
single param key, empty array clears, empty CSV components stripped on
read."
```

---

## Task 2: `buildFilterClauses` query helper

**Files:**
- Create: `src/utils/build-filter-clauses.ts`
- Test: `src/utils/build-filter-clauses.test.ts`

- [ ] **Step 2.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 2.2: Write the failing test**

Create `src/utils/build-filter-clauses.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildFilterClauses } from "./build-filter-clauses";

describe("buildFilterClauses", () => {
	test("returns empty string when no filters", () => {
		expect(buildFilterClauses({})).toBe("");
		expect(buildFilterClauses({ types: [], rarity: [], supertype: [], subtypes: [] })).toBe("");
	});

	test("renders a single types filter as ANDed clause", () => {
		expect(buildFilterClauses({ types: ["fire"] })).toBe(" AND (types:fire)");
	});

	test("ORs multiple values within a single dimension", () => {
		expect(buildFilterClauses({ types: ["fire", "water"] })).toBe(
			" AND (types:fire OR types:water)",
		);
	});

	test("ANDs across multiple dimensions", () => {
		expect(
			buildFilterClauses({
				types: ["fire"],
				supertype: ["Pokémon"],
			}),
		).toBe(" AND (types:fire) AND (supertype:Pokémon)");
	});

	test("quotes rarity values that contain spaces", () => {
		expect(buildFilterClauses({ rarity: ["Rare Holo", "Rare Holo VMAX"] })).toBe(
			' AND (rarity:"Rare Holo" OR rarity:"Rare Holo VMAX")',
		);
	});

	test("renders a fully-populated filter set in the canonical order", () => {
		expect(
			buildFilterClauses({
				types: ["fire"],
				rarity: ["Rare Holo VMAX"],
				supertype: ["Pokémon"],
				subtypes: ["VMAX"],
			}),
		).toBe(
			' AND (types:fire) AND (rarity:"Rare Holo VMAX") AND (supertype:Pokémon) AND (subtypes:VMAX)',
		);
	});
});
```

- [ ] **Step 2.3: Run the failing test**

```bash
bun test src/utils/build-filter-clauses.test.ts
```
Expected: FAIL with "Cannot find module './build-filter-clauses'".

- [ ] **Step 2.4: Implement the helper**

Create `src/utils/build-filter-clauses.ts`:

```ts
/**
 * Filter values per dimension. All optional. Empty/missing arrays are
 * treated as "no filter for this dimension".
 */
export interface FilterClauses {
	types?: string[];
	rarity?: string[];
	supertype?: string[];
	subtypes?: string[];
}

/**
 * Compose pokemontcg.io query clauses from a filter object. Returns a
 * string ready to be appended to a primary query. Empty input → "".
 *
 * Within a dimension values OR; across dimensions AND. Rarity values
 * contain spaces and must be double-quoted; the other dimensions are
 * single tokens and don't need quoting.
 *
 * Example:
 *   buildFilterClauses({ types: ["fire", "water"], rarity: ["Rare Holo"] })
 *   →  ' AND (types:fire OR types:water) AND (rarity:"Rare Holo")'
 */
export function buildFilterClauses(filters: FilterClauses): string {
	const clauses: string[] = [];
	if (filters.types?.length) {
		clauses.push(`(${filters.types.map((t) => `types:${t}`).join(" OR ")})`);
	}
	if (filters.rarity?.length) {
		clauses.push(
			`(${filters.rarity.map((r) => `rarity:"${r}"`).join(" OR ")})`,
		);
	}
	if (filters.supertype?.length) {
		clauses.push(
			`(${filters.supertype.map((s) => `supertype:${s}`).join(" OR ")})`,
		);
	}
	if (filters.subtypes?.length) {
		clauses.push(
			`(${filters.subtypes.map((s) => `subtypes:${s}`).join(" OR ")})`,
		);
	}
	return clauses.length === 0 ? "" : ` AND ${clauses.join(" AND ")}`;
}
```

- [ ] **Step 2.5: Run tests to confirm pass**

```bash
bun test src/utils/build-filter-clauses.test.ts
```
Expected: 6 pass, 0 fail.

- [ ] **Step 2.6: Verify**

```bash
bun run typecheck && bun run lint
```
Expected: clean.

- [ ] **Step 2.7: Commit**

```bash
git add src/utils/build-filter-clauses.ts src/utils/build-filter-clauses.test.ts
git commit -m "feat: add buildFilterClauses query helper

Composes pokemontcg.io query clauses from a filter object. OR within
dimensions, AND across. Rarity values quoted (contain spaces); others
don't need quoting."
```

---

## Task 3: API client — filter-value endpoints

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 3.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 3.2: Add the four endpoint functions**

Append to `src/api.ts` (after the existing exports):

```ts
async function getStringList(endpoint: string): Promise<string[]> {
	const resp = await fetch(`https://api.pokemontcg.io/v2/${endpoint}`);
	if (!resp.ok) throw new Error(`Unable to fetch ${endpoint}`);
	const json = (await resp.json()) as { data: string[] };
	return json.data;
}

export function getTypes(): Promise<string[]> {
	return getStringList("types");
}

export function getSubtypes(): Promise<string[]> {
	return getStringList("subtypes");
}

export function getSupertypes(): Promise<string[]> {
	return getStringList("supertypes");
}

export function getRarities(): Promise<string[]> {
	return getStringList("rarities");
}
```

- [ ] **Step 3.3: Verify typecheck and build**

```bash
bun run typecheck && bun run lint
```
Expected: clean.

- [ ] **Step 3.4: Commit**

```bash
git add src/api.ts
git commit -m "feat(api): add getTypes/getSubtypes/getSupertypes/getRarities

Four /v2/* string-list endpoints for filter dimension values. Shared
getStringList helper since the response shape is identical."
```

---

## Task 4: Extend `getCardsBySet` and `getCardsByPokedexNumber` with filters

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 4.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 4.2: Update `getCardsBySet` and `getCardsByPokedexNumber`**

In `src/api.ts`, add the import at the top of the file (Biome will sort):

```ts
import { type FilterClauses, buildFilterClauses } from "./utils/build-filter-clauses";
```

Then change the two existing functions to accept an optional `filters` parameter:

```ts
export function getCardsBySet(
	setId: string,
	page: number,
	pageSize: number,
	filters?: FilterClauses,
): Promise<{ cards: HoloCardData[]; totalCount: number }> {
	return getCardsByQuery(
		`set.id:${setId}${buildFilterClauses(filters ?? {})}`,
		page,
		pageSize,
		"number",
	);
}

export function getCardsByPokedexNumber(
	pokedexNumber: number,
	page: number,
	pageSize: number,
	filters?: FilterClauses,
): Promise<{ cards: HoloCardData[]; totalCount: number }> {
	return getCardsByQuery(
		`nationalPokedexNumbers:${pokedexNumber}${buildFilterClauses(filters ?? {})}`,
		page,
		pageSize,
		"set.releaseDate,number",
	);
}
```

The change is backward-compatible: omitting `filters` (existing call sites) yields `buildFilterClauses({})` which returns `""`, so the query is identical to before.

- [ ] **Step 4.3: Verify typecheck**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 48 pass, typecheck clean, lint with only the pre-existing warning.

- [ ] **Step 4.4: Commit**

```bash
git add src/api.ts
git commit -m "feat(api): extend getCardsBySet/getCardsByPokedexNumber with filters param

Optional FilterClauses appended via buildFilterClauses. Existing
callers unaffected (default empty filters = empty clauses)."
```

---

## Task 5: Extend `freshness.ts` with `filterValues` kind

**Files:**
- Modify: `src/store/freshness.ts`

- [ ] **Step 5.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 5.2: Extend the `kind` union and TTL switch**

In `src/store/freshness.ts`, replace the `FreshnessInput` interface and `shouldRefetch` function:

```ts
export interface FreshnessInput {
	/** ms since epoch when the cache entry was last fetched, or null if never. */
	lastFetchedAt: number | null;
	/** Which cache is being checked. Lets you pick a different TTL per kind. */
	kind: "sets" | "pokemonList" | "filterValues";
}

const DAY_MS = 24 * 60 * 60 * 1000;

// New sets release ~quarterly, so a week between revalidations is plenty.
const SETS_TTL_MS = 7 * DAY_MS;

// The Pokédex list past #1025 hasn't grown in years; revalidate monthly.
const POKEMON_LIST_TTL_MS = 30 * DAY_MS;

// Filter dimensions (types, rarities, supertypes, subtypes) change with new
// TCG sets — same cadence as the sets list itself.
const FILTER_VALUES_TTL_MS = 7 * DAY_MS;

export function shouldRefetch({
	lastFetchedAt,
	kind,
}: FreshnessInput): boolean {
	if (lastFetchedAt === null) return true;
	const age = Date.now() - lastFetchedAt;
	const ttl =
		kind === "sets"
			? SETS_TTL_MS
			: kind === "pokemonList"
				? POKEMON_LIST_TTL_MS
				: FILTER_VALUES_TTL_MS;
	return age > ttl;
}
```

- [ ] **Step 5.3: Verify typecheck**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: clean. The existing call sites (`shouldRefetch({ kind: "sets" | "pokemonList" })`) still typecheck because the union widened.

- [ ] **Step 5.4: Commit**

```bash
git add src/store/freshness.ts
git commit -m "feat(freshness): add filterValues kind with weekly TTL

Filter dimensions change with new TCG releases (same cadence as the
sets list), so reuse the 7-day TTL."
```

---

## Task 6: Extend `ApiCacheSlice` with filter-value caches + load actions

**Files:**
- Modify: `src/store/api-cache-slice.ts`
- Modify: `src/store/index.ts`

- [ ] **Step 6.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 6.2: Replace `src/store/api-cache-slice.ts`**

Full file contents:

```ts
import type { StateCreator } from "zustand";
import {
	getRarities,
	getSets,
	getSubtypes,
	getSupertypes,
	getTypes,
	type PokemonListEntry,
	type PokemonSet,
} from "../api";
import { shouldRefetch } from "./freshness";

const POKEMON_LIST_LIMIT = 1025;

export interface ApiCacheSlice {
	sets: PokemonSet[] | null;
	setsFetchedAt: number | null;
	setsLoading: boolean;

	pokemonList: PokemonListEntry[] | null;
	pokemonListFetchedAt: number | null;
	pokemonListLoading: boolean;

	types: string[] | null;
	typesFetchedAt: number | null;
	typesLoading: boolean;

	rarities: string[] | null;
	raritiesFetchedAt: number | null;
	raritiesLoading: boolean;

	supertypes: string[] | null;
	supertypesFetchedAt: number | null;
	supertypesLoading: boolean;

	subtypes: string[] | null;
	subtypesFetchedAt: number | null;
	subtypesLoading: boolean;

	loadSets: () => Promise<void>;
	loadPokemonList: () => Promise<void>;
	loadTypes: () => Promise<void>;
	loadRarities: () => Promise<void>;
	loadSupertypes: () => Promise<void>;
	loadSubtypes: () => Promise<void>;
}

export const createApiCacheSlice: StateCreator<ApiCacheSlice> = (set, get) => ({
	sets: null,
	setsFetchedAt: null,
	setsLoading: false,

	pokemonList: null,
	pokemonListFetchedAt: null,
	pokemonListLoading: false,

	types: null,
	typesFetchedAt: null,
	typesLoading: false,

	rarities: null,
	raritiesFetchedAt: null,
	raritiesLoading: false,

	supertypes: null,
	supertypesFetchedAt: null,
	supertypesLoading: false,

	subtypes: null,
	subtypesFetchedAt: null,
	subtypesLoading: false,

	loadSets: async () => {
		const { setsLoading, setsFetchedAt } = get();
		if (setsLoading) return;
		if (!shouldRefetch({ lastFetchedAt: setsFetchedAt, kind: "sets" })) return;
		set({ setsLoading: true });
		try {
			const sets = await getSets();
			set({ sets, setsFetchedAt: Date.now(), setsLoading: false });
		} catch (e) {
			console.error(e);
			set({ setsLoading: false });
		}
	},

	loadPokemonList: async () => {
		const { pokemonListLoading, pokemonListFetchedAt } = get();
		if (pokemonListLoading) return;
		if (
			!shouldRefetch({
				lastFetchedAt: pokemonListFetchedAt,
				kind: "pokemonList",
			})
		)
			return;
		set({ pokemonListLoading: true });
		try {
			const resp = await fetch(
				`https://pokeapi.co/api/v2/pokemon?limit=${POKEMON_LIST_LIMIT}`,
			);
			if (!resp.ok) throw new Error("Unable to fetch Pokémon list");
			const json = (await resp.json()) as { results: PokemonListEntry[] };
			set({
				pokemonList: json.results,
				pokemonListFetchedAt: Date.now(),
				pokemonListLoading: false,
			});
		} catch (e) {
			console.error(e);
			set({ pokemonListLoading: false });
		}
	},

	loadTypes: async () => {
		const { typesLoading, typesFetchedAt } = get();
		if (typesLoading) return;
		if (!shouldRefetch({ lastFetchedAt: typesFetchedAt, kind: "filterValues" }))
			return;
		set({ typesLoading: true });
		try {
			const types = await getTypes();
			set({ types, typesFetchedAt: Date.now(), typesLoading: false });
		} catch (e) {
			console.error(e);
			set({ typesLoading: false });
		}
	},

	loadRarities: async () => {
		const { raritiesLoading, raritiesFetchedAt } = get();
		if (raritiesLoading) return;
		if (
			!shouldRefetch({ lastFetchedAt: raritiesFetchedAt, kind: "filterValues" })
		)
			return;
		set({ raritiesLoading: true });
		try {
			const rarities = await getRarities();
			set({ rarities, raritiesFetchedAt: Date.now(), raritiesLoading: false });
		} catch (e) {
			console.error(e);
			set({ raritiesLoading: false });
		}
	},

	loadSupertypes: async () => {
		const { supertypesLoading, supertypesFetchedAt } = get();
		if (supertypesLoading) return;
		if (
			!shouldRefetch({
				lastFetchedAt: supertypesFetchedAt,
				kind: "filterValues",
			})
		)
			return;
		set({ supertypesLoading: true });
		try {
			const supertypes = await getSupertypes();
			set({
				supertypes,
				supertypesFetchedAt: Date.now(),
				supertypesLoading: false,
			});
		} catch (e) {
			console.error(e);
			set({ supertypesLoading: false });
		}
	},

	loadSubtypes: async () => {
		const { subtypesLoading, subtypesFetchedAt } = get();
		if (subtypesLoading) return;
		if (
			!shouldRefetch({ lastFetchedAt: subtypesFetchedAt, kind: "filterValues" })
		)
			return;
		set({ subtypesLoading: true });
		try {
			const subtypes = await getSubtypes();
			set({ subtypes, subtypesFetchedAt: Date.now(), subtypesLoading: false });
		} catch (e) {
			console.error(e);
			set({ subtypesLoading: false });
		}
	},
});
```

- [ ] **Step 6.3: Update `partialize` in `src/store/index.ts`**

Replace `src/store/index.ts` contents with:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type ApiCacheSlice, createApiCacheSlice } from "./api-cache-slice";

type AppStore = ApiCacheSlice;

// Bump if the persisted shape changes in a non-additive way and you want to
// drop old data instead of writing a migration. Phase 1 #5 only ADDS fields
// (filter-value caches with null defaults), so no bump needed — Phase 1 #4
// users keep their cached sets / pokémon list and just gain the new fields.
const STORAGE_VERSION = 2;

export const useStore = create<AppStore>()(
	persist(createApiCacheSlice, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
		// Mirror cache data to localStorage. Loading flags stay in memory.
		partialize: (state) => ({
			sets: state.sets,
			setsFetchedAt: state.setsFetchedAt,
			pokemonList: state.pokemonList,
			pokemonListFetchedAt: state.pokemonListFetchedAt,
			types: state.types,
			typesFetchedAt: state.typesFetchedAt,
			rarities: state.rarities,
			raritiesFetchedAt: state.raritiesFetchedAt,
			supertypes: state.supertypes,
			supertypesFetchedAt: state.supertypesFetchedAt,
			subtypes: state.subtypes,
			subtypesFetchedAt: state.subtypesFetchedAt,
		}),
	}),
);
```

- [ ] **Step 6.4: Verify**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 48 tests pass, typecheck clean, lint with only the pre-existing warning.

- [ ] **Step 6.5: Commit**

```bash
git add src/store/api-cache-slice.ts src/store/index.ts
git commit -m "feat(store): cache filter dimension values

Adds types/rarities/supertypes/subtypes caches alongside sets and
pokemonList. Same shouldRefetch + loading pattern. Persisted via
partialize. No STORAGE_VERSION bump (additive change)."
```

---

## Task 7: `useFilterValues` hook

**Files:**
- Create: `src/hooks/use-filter-values.ts`
- Test: `src/hooks/use-filter-values.test.tsx`

- [ ] **Step 7.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 7.2: Write the failing test**

Create `src/hooks/use-filter-values.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { useFilterValues } from "./use-filter-values";

describe("useFilterValues", () => {
	test("returns object with four named arrays", () => {
		const { result } = renderHook(() => useFilterValues());
		expect(result.current).toHaveProperty("types");
		expect(result.current).toHaveProperty("rarities");
		expect(result.current).toHaveProperty("supertypes");
		expect(result.current).toHaveProperty("subtypes");
	});

	test("each dimension defaults to an empty array (not null)", () => {
		const { result } = renderHook(() => useFilterValues());
		expect(Array.isArray(result.current.types)).toBe(true);
		expect(Array.isArray(result.current.rarities)).toBe(true);
		expect(Array.isArray(result.current.supertypes)).toBe(true);
		expect(Array.isArray(result.current.subtypes)).toBe(true);
	});
});
```

- [ ] **Step 7.3: Run the failing test**

```bash
bun test src/hooks/use-filter-values.test.tsx
```
Expected: FAIL with module-not-found.

- [ ] **Step 7.4: Implement the hook**

Create `src/hooks/use-filter-values.ts`:

```ts
import { useEffect } from "react";
import { useStore } from "../store";

interface FilterValues {
	types: string[];
	rarities: string[];
	supertypes: string[];
	subtypes: string[];
}

/**
 * Returns the four filter dimensions' available values, fetching them
 * lazily on first call. Same shape as usePokemonList — returns empty
 * arrays before the data lands so consumers can render placeholders
 * (or disabled chips) without null checks.
 */
export function useFilterValues(): FilterValues {
	const types = useStore((s) => s.types);
	const rarities = useStore((s) => s.rarities);
	const supertypes = useStore((s) => s.supertypes);
	const subtypes = useStore((s) => s.subtypes);
	const loadTypes = useStore((s) => s.loadTypes);
	const loadRarities = useStore((s) => s.loadRarities);
	const loadSupertypes = useStore((s) => s.loadSupertypes);
	const loadSubtypes = useStore((s) => s.loadSubtypes);

	useEffect(() => {
		loadTypes();
	}, [loadTypes]);
	useEffect(() => {
		loadRarities();
	}, [loadRarities]);
	useEffect(() => {
		loadSupertypes();
	}, [loadSupertypes]);
	useEffect(() => {
		loadSubtypes();
	}, [loadSubtypes]);

	return {
		types: types ?? [],
		rarities: rarities ?? [],
		supertypes: supertypes ?? [],
		subtypes: subtypes ?? [],
	};
}
```

- [ ] **Step 7.5: Run tests**

```bash
bun test src/hooks/use-filter-values.test.tsx
```
Expected: 2 pass, 0 fail.

- [ ] **Step 7.6: Verify whole suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 50 pass, 0 fail.

- [ ] **Step 7.7: Commit**

```bash
git add src/hooks/use-filter-values.ts src/hooks/use-filter-values.test.tsx
git commit -m "feat(hooks): add useFilterValues for chip-row option lists

Triggers lazy fetch of all four dimensions and returns empty arrays
until each lands. Mirrors the usePokemonList pattern."
```

---

## Task 8: `<FilterChip>` component (TDD)

**Files:**
- Create: `src/components/filter-chip-row/filter-chip.tsx`
- Test: `src/components/filter-chip-row/filter-chip.test.tsx`

- [ ] **Step 8.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 8.2: Write the failing test**

Create `src/components/filter-chip-row/filter-chip.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { MemoryRouter } from "react-router";
import { FilterChip } from "./filter-chip";

function renderInRouter(ui: React.ReactElement, initialUrl = "/") {
	return render(<MemoryRouter initialEntries={[initialUrl]}>{ui}</MemoryRouter>);
}

describe("<FilterChip />", () => {
	const baseProps = {
		label: "Type",
		paramName: "types",
		options: ["Fire", "Water", "Grass"],
	};

	test("renders inactive label when no values selected", () => {
		renderInRouter(<FilterChip {...baseProps} />);
		const button = screen.getByRole("button", { name: /type/i });
		expect(button.textContent).toContain("Type");
		expect(button.textContent).not.toContain("·");
	});

	test("renders active label preview with first value", () => {
		renderInRouter(<FilterChip {...baseProps} />, "/?types=Fire");
		const button = screen.getByRole("button", { name: /type/i });
		expect(button.textContent).toContain("Fire");
	});

	test("renders +N suffix when multiple values selected", () => {
		renderInRouter(<FilterChip {...baseProps} />, "/?types=Fire,Water,Grass");
		const button = screen.getByRole("button", { name: /type/i });
		expect(button.textContent).toContain("+2");
	});

	test("popover opens on click and shows options", () => {
		renderInRouter(<FilterChip {...baseProps} />);
		fireEvent.click(screen.getByRole("button", { name: /type/i }));
		expect(screen.getByRole("checkbox", { name: "Fire" })).toBeDefined();
		expect(screen.getByRole("checkbox", { name: "Water" })).toBeDefined();
		expect(screen.getByRole("checkbox", { name: "Grass" })).toBeDefined();
	});

	test("clicking an option toggles it in the URL", () => {
		const { container } = renderInRouter(<FilterChip {...baseProps} />);
		fireEvent.click(screen.getByRole("button", { name: /type/i }));
		fireEvent.click(screen.getByRole("checkbox", { name: "Fire" }));
		// The chip rerenders with active label after URL changes.
		const chipButton = container.querySelector("button.filter-chip");
		expect(chipButton?.textContent).toContain("Fire");
	});

	test("clear button (×) clears just this dimension", () => {
		renderInRouter(<FilterChip {...baseProps} />, "/?types=Fire,Water");
		const clearButton = screen.getByRole("button", { name: /clear type/i });
		fireEvent.click(clearButton);
		// After clearing, label returns to inactive state (no "Fire"/"Water" in label)
		const chipButton = screen.getByRole("button", { name: /^type$/i });
		expect(chipButton.textContent).not.toContain("Fire");
	});

	test("renders disabled chip when options array is empty", () => {
		renderInRouter(<FilterChip {...baseProps} options={[]} />);
		const button = screen.getByRole("button", { name: /type/i });
		expect(button.hasAttribute("disabled")).toBe(true);
	});
});
```

- [ ] **Step 8.3: Run failing test**

```bash
bun test src/components/filter-chip-row/filter-chip.test.tsx
```
Expected: FAIL with module-not-found.

- [ ] **Step 8.4: Implement the component**

Create `src/components/filter-chip-row/filter-chip.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useFilterParam } from "../../hooks/use-url-selection";

interface FilterChipProps {
	/** User-facing label, e.g. "Type". */
	label: string;
	/** URL search-param key, e.g. "types". */
	paramName: string;
	/** Available values for this dimension. Empty → chip is disabled. */
	options: string[];
}

export function FilterChip({ label, paramName, options }: FilterChipProps) {
	const [values, setValues] = useFilterParam(paramName);
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function onDocClick(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		}
		document.addEventListener("mousedown", onDocClick);
		return () => document.removeEventListener("mousedown", onDocClick);
	}, []);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") setIsOpen(false);
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const isActive = values.length > 0;
	const isDisabled = options.length === 0;

	function toggleValue(option: string) {
		const next = values.includes(option)
			? values.filter((v) => v !== option)
			: [...values, option];
		setValues(next);
	}

	function clear(e: React.MouseEvent) {
		e.stopPropagation();
		setValues([]);
	}

	const labelText = isActive
		? values.length === 1
			? `${label} · ${values[0]}`
			: `${label} · ${values[0]} +${values.length - 1}`
		: label;

	return (
		<div className="filter-chip-container" ref={containerRef}>
			<button
				type="button"
				className={`filter-chip${isActive ? " active" : ""}`}
				onClick={() => setIsOpen((o) => !o)}
				disabled={isDisabled}
				aria-expanded={isOpen}
				aria-haspopup="listbox"
			>
				<span>{labelText}</span>
				{isActive && (
					<span
						role="button"
						className="filter-chip-clear"
						aria-label={`Clear ${label}`}
						onClick={clear}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								clear(e as unknown as React.MouseEvent);
							}
						}}
						tabIndex={0}
					>
						×
					</span>
				)}
			</button>
			{isOpen && !isDisabled && (
				<div className="filter-chip-popover" role="listbox">
					{options.map((option) => (
						<label key={option} className="filter-chip-option">
							<input
								type="checkbox"
								checked={values.includes(option)}
								onChange={() => toggleValue(option)}
							/>
							<span>{option}</span>
						</label>
					))}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 8.5: Run tests to confirm pass**

```bash
bun test src/components/filter-chip-row/filter-chip.test.tsx
```
Expected: 7 pass, 0 fail.

- [ ] **Step 8.6: Verify whole suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 57 pass, typecheck clean.

- [ ] **Step 8.7: Commit**

```bash
git add src/components/filter-chip-row/filter-chip.tsx src/components/filter-chip-row/filter-chip.test.tsx
git commit -m "feat(filter-chip): add single-dimension chip with popover

Reads/writes its dimension via useFilterParam. Inactive label shows
just the dimension name; active shows a preview ('Type · Fire +2').
× button clears just this dimension. Disabled when options array empty
(values not yet loaded)."
```

---

## Task 9: `<FilterChipRow>` component (TDD)

**Files:**
- Create: `src/components/filter-chip-row/filter-chip-row.tsx`
- Create: `src/components/filter-chip-row/index.ts`
- Test: `src/components/filter-chip-row/filter-chip-row.test.tsx`
- Create: `src/components/filter-chip-row/filter-chip-row.css`

- [ ] **Step 9.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 9.2: Write the failing test**

Create `src/components/filter-chip-row/filter-chip-row.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { MemoryRouter } from "react-router";
import { FilterChipRow } from "./filter-chip-row";

const fullProps = {
	types: ["Fire", "Water"],
	rarities: ["Rare Holo", "Rare Holo VMAX"],
	supertypes: ["Pokémon", "Trainer"],
	subtypes: ["Basic", "VMAX"],
};

function renderInRouter(ui: React.ReactElement, initialUrl = "/") {
	return render(<MemoryRouter initialEntries={[initialUrl]}>{ui}</MemoryRouter>);
}

describe("<FilterChipRow />", () => {
	test("renders four chips (Type, Rarity, Supertype, Subtype)", () => {
		renderInRouter(<FilterChipRow {...fullProps} />);
		expect(screen.getByRole("button", { name: /^type$/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /^rarity$/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /^supertype$/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /^subtype$/i })).toBeDefined();
	});

	test("does not show 'Clear filters' link when no filters are active", () => {
		renderInRouter(<FilterChipRow {...fullProps} />);
		expect(screen.queryByText(/clear filters/i)).toBeNull();
	});

	test("shows 'Clear filters' link when any filter is active", () => {
		renderInRouter(<FilterChipRow {...fullProps} />, "/?types=Fire");
		expect(screen.getByText(/clear filters/i)).toBeDefined();
	});

	test("'Clear filters' link clears all four dimensions", () => {
		renderInRouter(
			<FilterChipRow {...fullProps} />,
			"/?types=Fire&rarity=Rare%20Holo&supertype=Pok%C3%A9mon&subtypes=Basic",
		);
		fireEvent.click(screen.getByText(/clear filters/i));
		expect(screen.queryByText(/clear filters/i)).toBeNull();
	});
});
```

- [ ] **Step 9.3: Run failing test**

```bash
bun test src/components/filter-chip-row/filter-chip-row.test.tsx
```
Expected: FAIL with module-not-found.

- [ ] **Step 9.4: Implement the component**

Create `src/components/filter-chip-row/filter-chip-row.tsx`:

```tsx
import "./filter-chip-row.css";
import { useFilterParam } from "../../hooks/use-url-selection";
import { FilterChip } from "./filter-chip";

interface FilterChipRowProps {
	types: string[];
	rarities: string[];
	supertypes: string[];
	subtypes: string[];
}

export function FilterChipRow({
	types,
	rarities,
	supertypes,
	subtypes,
}: FilterChipRowProps) {
	const [activeTypes, setTypes] = useFilterParam("types");
	const [activeRarity, setRarity] = useFilterParam("rarity");
	const [activeSupertype, setSupertype] = useFilterParam("supertype");
	const [activeSubtypes, setSubtypes] = useFilterParam("subtypes");

	const anyActive =
		activeTypes.length > 0 ||
		activeRarity.length > 0 ||
		activeSupertype.length > 0 ||
		activeSubtypes.length > 0;

	function clearAll() {
		setTypes([]);
		setRarity([]);
		setSupertype([]);
		setSubtypes([]);
	}

	return (
		<div className="filter-chip-row" role="toolbar" aria-label="Filters">
			<FilterChip label="Type" paramName="types" options={types} />
			<FilterChip label="Rarity" paramName="rarity" options={rarities} />
			<FilterChip
				label="Supertype"
				paramName="supertype"
				options={supertypes}
			/>
			<FilterChip label="Subtype" paramName="subtypes" options={subtypes} />
			{anyActive && (
				<button
					type="button"
					className="filter-chip-row-clear-all"
					onClick={clearAll}
				>
					Clear filters
				</button>
			)}
		</div>
	);
}
```

- [ ] **Step 9.5: Create the index module**

Create `src/components/filter-chip-row/index.ts`:

```ts
export { FilterChipRow } from "./filter-chip-row";
export { FilterChip } from "./filter-chip";
```

- [ ] **Step 9.6: Create the CSS**

Create `src/components/filter-chip-row/filter-chip-row.css`:

```css
/*
 * Persistent filter chip row rendered between the existing tabs and the
 * card grid on both pages. One chip per dimension, plus a "Clear filters"
 * affordance when any dimension is active.
 */

.filter-chip-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	align-items: center;
	padding: 0.5rem 1rem;
}

.filter-chip-container {
	position: relative;
	display: inline-block;
}

.filter-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.3rem 0.75rem;
	border: 1px solid rgba(255, 255, 255, 0.15);
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.05);
	color: inherit;
	font-size: 0.85rem;
	cursor: pointer;
	transition: background 0.12s ease-out, border-color 0.12s ease-out;
}

.filter-chip:hover:not(:disabled),
.filter-chip:focus-visible {
	background: rgba(255, 255, 255, 0.1);
	border-color: rgba(255, 255, 255, 0.25);
	outline: none;
}

.filter-chip:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.filter-chip.active {
	background: rgba(120, 100, 255, 0.18);
	border-color: rgba(120, 100, 255, 0.5);
}

.filter-chip-clear {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1rem;
	height: 1rem;
	border-radius: 50%;
	font-size: 0.75rem;
	cursor: pointer;
	background: rgba(255, 255, 255, 0.1);
}

.filter-chip-clear:hover {
	background: rgba(255, 255, 255, 0.2);
}

.filter-chip-popover {
	position: absolute;
	top: calc(100% + 0.25rem);
	left: 0;
	z-index: 10;
	min-width: 12rem;
	max-height: 400px;
	overflow-y: auto;
	padding: 0.5rem;
	background: #1a1a1f;
	border: 1px solid rgba(255, 255, 255, 0.15);
	border-radius: 8px;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.filter-chip-option {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.35rem 0.5rem;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.85rem;
}

.filter-chip-option:hover {
	background: rgba(255, 255, 255, 0.08);
}

.filter-chip-option input[type="checkbox"] {
	cursor: pointer;
}

.filter-chip-row-clear-all {
	margin-left: auto;
	padding: 0.3rem 0.6rem;
	background: transparent;
	border: none;
	color: rgba(255, 255, 255, 0.6);
	font-size: 0.85rem;
	cursor: pointer;
	text-decoration: underline;
}

.filter-chip-row-clear-all:hover {
	color: rgba(255, 255, 255, 0.9);
}
```

- [ ] **Step 9.7: Run tests**

```bash
bun test src/components/filter-chip-row/
```
Expected: 11 pass (7 chip + 4 row), 0 fail.

- [ ] **Step 9.8: Verify whole suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 61 pass, typecheck clean.

- [ ] **Step 9.9: Commit**

```bash
git add src/components/filter-chip-row/
git commit -m "feat(filter-chip-row): add chip-row orchestrator with clear-all

Renders four FilterChips for the canonical dimensions and a 'Clear
filters' link visible when any dimension is active. Reads each
dimension's URL param to determine the active state."
```

---

## Task 10: Wire `SetsPage` to render `<FilterChipRow>` and pass filters

**Files:**
- Modify: `src/pages/sets-page.tsx`

- [ ] **Step 10.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 10.2: Update `sets-page.tsx`**

Replace the contents of `src/pages/sets-page.tsx` with:

```tsx
import { useEffect, useMemo } from "react";
import { getCardsBySet } from "../api";
import { CardGrid } from "../components/card-grid";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import { FilterChipRow } from "../components/filter-chip-row";
import { Header } from "../components/header";
import type { HoloCardData } from "../components/holo-card";
import { SeriesTabs } from "../components/series-tabs";
import { SetTabs } from "../components/set-tabs";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { useFilterValues } from "../hooks/use-filter-values";
import { usePokemonList } from "../hooks/use-pokemon-list";
import { useSets } from "../hooks/use-sets";
import {
	useFilterParam,
	useSetIdParam,
} from "../hooks/use-url-selection";
import { pokemonNameByDex } from "../utils/pokemon-name";

export function SetsPage() {
	const sets = useSets();
	const pokemonList = usePokemonList();
	const filterValues = useFilterValues();
	const [selectedSetId, setSelectedSetId] = useSetIdParam();
	const [types] = useFilterParam("types");
	const [rarity] = useFilterParam("rarity");
	const [supertype] = useFilterParam("supertype");
	const [subtypes] = useFilterParam("subtypes");

	// Stable signature of the filter state so cache keys vary when filters
	// change. Each toggle yields a different string → fresh useCards entry,
	// while toggling back returns the cached results.
	const filterSig = `${types.join(",")}|${rarity.join(",")}|${supertype.join(",")}|${subtypes.join(",")}`;
	const cacheKey = selectedSetId
		? filterSig === "|||"
			? selectedSetId
			: `${selectedSetId}|${filterSig}`
		: null;

	const fetcher: CardFetcher = useMemo(
		() => (_key, page, pageSize) => {
			if (!selectedSetId) {
				return Promise.resolve({ cards: [], totalCount: 0 });
			}
			return getCardsBySet(selectedSetId, page, pageSize, {
				types,
				rarity,
				supertype,
				subtypes,
			});
		},
		[selectedSetId, types, rarity, supertype, subtypes],
	);

	const { cards, loading, loadMore } = useCards(cacheKey, fetcher);

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
			<FilterChipRow
				types={filterValues.types}
				rarities={filterValues.rarities}
				supertypes={filterValues.supertypes}
				subtypes={filterValues.subtypes}
			/>
			<CardGrid
				setId={cacheKey}
				cards={cards}
				onEndReached={loadMore}
				renderOverlay={renderOverlay}
			/>
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
```

Diff vs. previous Task 10 (Phase 1 #4): adds `useFilterValues` and `useFilterParam` reads; computes `filterSig` and a filter-aware `cacheKey`; wraps the fetcher in `useMemo` capturing the current filters; renders `<FilterChipRow>` between `<SetTabs>` and `<CardGrid>`. Existing renderOverlay logic is unchanged.

- [ ] **Step 10.3: Verify**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 61 pass, typecheck clean. The page-level integration is mostly type-system glue.

- [ ] **Step 10.4: Commit**

```bash
git add src/pages/sets-page.tsx
git commit -m "feat(sets-page): wire filter chip row and filter-aware cache key

Reads four filter URL params, composes them into a deterministic cache
key, and passes them to getCardsBySet. The filter row renders between
SetTabs and CardGrid."
```

---

## Task 11: Wire `PokemonPage` to render `<FilterChipRow>` and pass filters

**Files:**
- Modify: `src/pages/pokemon-page.tsx`

- [ ] **Step 11.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 11.2: Update `pokemon-page.tsx`**

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
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { useFilterValues } from "../hooks/use-filter-values";
import {
	useFilterParam,
	usePokedexParam,
} from "../hooks/use-url-selection";
import "./pokemon-page.css";

function renderOverlay(card: HoloCardData) {
	return (
		<CrossLinkOverlay
			links={[{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` }]}
		/>
	);
}

export function PokemonPage() {
	const filterValues = useFilterValues();
	const [pokedexNumber, setPokedexNumber] = usePokedexParam();
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

	const { cards, loading, loadMore } = useCards(cacheKey, fetcher);

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
			<FilterChipRow
				types={filterValues.types}
				rarities={filterValues.rarities}
				supertypes={filterValues.supertypes}
				subtypes={filterValues.subtypes}
			/>
			<CardGrid
				setId={cacheKey}
				cards={cards}
				onEndReached={loadMore}
				renderOverlay={renderOverlay}
			/>
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
```

Diff vs. previous Task 11 (Phase 1 #4): adds `useFilterValues` + four `useFilterParam` reads; computes `filterSig` and filter-aware `cacheKey`; wraps fetcher in `useMemo` capturing filters; renders `<FilterChipRow>` between `<PokemonFilter>` and `<CardGrid>`. The existing module-level `renderOverlay` is unchanged. The previous `useCallback` for `handleEndReached` is no longer needed because `loadMore` is the same function reference within useCards across renders.

- [ ] **Step 11.3: Verify**

```bash
bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 61 pass, typecheck clean, build succeeds.

- [ ] **Step 11.4: Commit**

```bash
git add src/pages/pokemon-page.tsx
git commit -m "feat(pokemon-page): wire filter chip row and filter-aware cache key

Same shape as SetsPage: filter URL params feed both the visible chip
row and the API query, with a composite cache key so toggles
invalidate cleanly."
```

---

## Task 12: Final verification suite

**Files:** none (read-only verification)

- [ ] **Step 12.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-filters && pwd && git branch --show-current
```

- [ ] **Step 12.2: Run all checks**

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
Expected: 61 pass / 0 fail.

```bash
bun run build
```
Expected: success.

- [ ] **Step 12.3: Manual smoke test in dev**

Start the dev server and verify the new behavior end-to-end:

```bash
bun run dev
```

In a browser:

1. Navigate to `/?setId=swsh12pt5` (Crown Zenith). The filter chip row should appear between the set tabs and the grid with four chips: Type, Rarity, Supertype, Subtype.
2. The chips might be disabled briefly while filter values fetch. They should become enabled within a second or two.
3. Click "Type". Popover opens with type checkboxes (Fire, Water, Grass, etc.).
4. Check "Fire". URL should become `/?setId=swsh12pt5&types=Fire` and the grid should refresh to show only fire-type cards.
5. Check "Water". URL should become `/?setId=swsh12pt5&types=Fire,Water` and the grid should show fire OR water cards.
6. Click outside to close the popover. Click the "×" on the Type chip. URL should drop the `types` param; grid restores.
7. Set multiple filters across dimensions: e.g. `types=Fire&rarity=Rare%20Holo`. Verify the grid filters correctly.
8. With multiple filters active, the "Clear filters" link should appear at the right of the chip row. Click it. URL should drop all four filter params; chips return to inactive.
9. Switch to By-Pokémon (`/pokemon?dex=25` for Pikachu). Filter chip row should still render. Verify filtering works the same way.
10. Reload the page directly with filters in the URL (`/?setId=swsh12pt5&types=Fire`). Filters should apply immediately.

If any step doesn't behave as expected, debug, fix, and commit. If smoke test passes, no commit needed.

- [ ] **Step 12.4: Console-clean check**

While the dev server is running, open the browser console. Apply a few filters and confirm:
- No `[holo-card] Unknown rarity` warnings (Phase 0 invariant).
- No errors from React Router.
- No errors from the Pokémon TCG API.

- [ ] **Step 12.5: Update spec status**

Edit `docs/superpowers/specs/2026-05-03-phase-1-advanced-filters-design.md`. Change:
```markdown
**Status:** Approved (design)
```
to:
```markdown
**Status:** Implemented
```

```bash
git add docs/superpowers/specs/2026-05-03-phase-1-advanced-filters-design.md
git commit -m "docs: mark Phase 1 advanced filters spec as implemented"
```

---

## Done criteria

- [ ] All Phase 1 #5 tasks (1–12) above are checked off.
- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` all pass.
- [ ] Manual smoke test (Step 12.3) passes — filters apply on both pages, multi-select works, "Clear filters" works, filter URLs reload correctly.
- [ ] Spec status reads "Implemented".

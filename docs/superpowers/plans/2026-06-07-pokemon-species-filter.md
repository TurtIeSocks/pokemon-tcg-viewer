# Pokémon Species Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Pokémon" (species) filter select to the card-list search controls that narrows the grid to one chosen species, grouping all name variants ("Brock's Rhydon" → "Rhydon") by national Pokédex number.

**Architecture:** Reuse the existing `dexNumber` rail end-to-end. The filter value is a national dex number written to a new `ListSearch.pokemon` URL param; `buildCorpusQuery` routes it into the `dexNumber` field that `queryCorpus` already filters on (no engine change). Filter options are the distinct species present in the cards in scope, labeled from the PokéAPI species list. Shown on `/search` and `/$series/$set`, not `/pokemon/$name`.

**Tech Stack:** TanStack Start/Router, Zustand, Radix Select (shadcn), Bun test (`bun:test`), Biome.

Spec: `docs/superpowers/specs/2026-06-07-pokemon-species-filter-design.md`

---

## File Structure

- `src/lib/card-query.ts` — add `pokemon` to `ListSearch`; merge it into `buildCorpusQuery`'s `dexNumber`.
- `src/lib/list-search.ts` — `pokemon` default + validation + URL serialization.
- `src/lib/slug.ts` — extract a shared `titleCaseSlug` helper (species-name display).
- `src/routes/pokemon/$name.tsx` — use the shared `titleCaseSlug` (remove the local dup).
- `src/server/set-facets.ts` — `PokemonFacet` type, `SetFacets.pokemon`, `deriveFacets(cards, dexName?)`.
- `src/routes/search.tsx` — fetch species list in loader, derive facets in loader, show filter.
- `src/routes/$series/$set/index.tsx` — fetch species list in loader, pass resolver to `deriveFacets`, show filter.
- `src/components/islands/search-controls.tsx` — `showPokemonFilter` prop + `PokemonFilterSelect`.
- `src/lib/serialized-query.ts` — capture `search.pokemon` into `SerializedQuery.dexNumber`.

Test files (all already exist): `src/lib/list-search.test.ts`, `src/lib/card-query.test.ts`, `src/lib/slug.test.ts`, `src/server/set-facets.test.ts`, `src/lib/serialized-query.test.ts`.

---

## Task 1: `pokemon` search param (type + validation + URL serialization)

**Files:**
- Modify: `src/lib/card-query.ts` (the `ListSearch` interface only)
- Modify: `src/lib/list-search.ts`
- Test: `src/lib/list-search.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/list-search.test.ts` (match the existing `describe`/`test` + `bun:test` style already in that file):

```ts
import { describe, expect, test } from "bun:test";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "./list-search";

describe("pokemon param", () => {
	test("defaults to null", () => {
		expect(LIST_SEARCH_DEFAULTS.pokemon).toBeNull();
	});

	test("validates a dex number from number or string", () => {
		expect(validateListSearch({ pokemon: 112 }).pokemon).toBe(112);
		expect(validateListSearch({ pokemon: "112" }).pokemon).toBe(112);
	});

	test("rejects out-of-range / junk → null", () => {
		expect(validateListSearch({ pokemon: 0 }).pokemon).toBeNull();
		expect(validateListSearch({ pokemon: 9999 }).pokemon).toBeNull();
		expect(validateListSearch({ pokemon: "abc" }).pokemon).toBeNull();
		expect(validateListSearch({}).pokemon).toBeNull();
	});

	test("serializes to URL string, omits when null", () => {
		expect(listSearchToUrl({ pokemon: 112 }).pokemon).toBe("112");
		expect(listSearchToUrl({ pokemon: null }).pokemon).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/list-search.test.ts`
Expected: FAIL — `pokemon` does not exist on `ListSearch` / is undefined.

- [ ] **Step 3: Add the field to `ListSearch`**

In `src/lib/card-query.ts`, inside the `ListSearch` interface (after `yearMax`):

```ts
	/** National Pokédex number of the selected species. Null → no species filter. */
	pokemon: number | null;
```

- [ ] **Step 4: Wire defaults + validation + serialization**

In `src/lib/list-search.ts`:

Add to `LIST_SEARCH_DEFAULTS` (after `mode: "fuzzy"` — keep the object a full `ListSearch`):

```ts
	pokemon: null,
```

Add a bounded-dex parser near `toYear` inside `validateListSearch`:

```ts
	// National dex upper bound (matches the species-list fetch limit, MAX_DEX).
	const toDex = (v: unknown): number | null => {
		if (typeof v !== "string" && typeof v !== "number") return null;
		const n = Number(v);
		return v !== "" && Number.isInteger(n) && n >= 1 && n <= 1025 ? n : null;
	};
```

Add to the returned object:

```ts
		pokemon: toDex(search.pokemon),
```

Add to `listSearchToUrl` (after the `yearMax` block):

```ts
	if (s.pokemon !== undefined)
		out.pokemon = s.pokemon != null ? String(s.pokemon) : undefined;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/lib/list-search.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/card-query.ts src/lib/list-search.ts src/lib/list-search.test.ts
git commit -m "feat(search): add pokemon (species dex) list-search param"
```

---

## Task 2: Route the param into the corpus query

**Files:**
- Modify: `src/lib/card-query.ts` (`buildCorpusQuery`)
- Test: `src/lib/card-query.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/card-query.test.ts`:

```ts
describe("pokemon → dexNumber", () => {
	test("global branch: pokemon sets dexNumber", () => {
		const q = buildCorpusQuery({ ...empty, pokemon: 112 }, {});
		expect(q.dexNumber).toBe(112);
	});
	test("set branch: pokemon sets dexNumber within the set", () => {
		const q = buildCorpusQuery({ ...empty, pokemon: 25 }, { setId: "swsh9" });
		expect(q.setId).toBe("swsh9");
		expect(q.dexNumber).toBe(25);
	});
	test("dex context wins over the pokemon filter", () => {
		const q = buildCorpusQuery({ ...empty, pokemon: 25 }, { dexNumber: 6 });
		expect(q.dexNumber).toBe(6);
	});
	test("no pokemon filter → dexNumber undefined in global/set branches", () => {
		expect(buildCorpusQuery(empty, {}).dexNumber).toBeUndefined();
		expect(buildCorpusQuery(empty, { setId: "swsh9" }).dexNumber).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/card-query.test.ts`
Expected: FAIL — `dexNumber` is `undefined` in the set/global branches.

- [ ] **Step 3: Merge `s.pokemon` into the two relevant branches**

In `src/lib/card-query.ts` `buildCorpusQuery`, the `ctx.setId` branch and the final global (`setId: null`) branch each gain a `dexNumber` field. Leave the `ctx.dexNumber` branch unchanged.

In the `ctx.setId != null` return object, add:

```ts
			dexNumber: s.pokemon ?? undefined,
```

In the final global return object, add:

```ts
			dexNumber: s.pokemon ?? undefined,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/card-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/card-query.ts src/lib/card-query.test.ts
git commit -m "feat(search): route pokemon filter into corpus dexNumber"
```

---

## Task 3: Extract a shared `titleCaseSlug` helper

**Files:**
- Modify: `src/lib/slug.ts`
- Modify: `src/routes/pokemon/$name.tsx` (use the shared helper)
- Test: `src/lib/slug.test.ts`

Rationale: `src/routes/pokemon/$name.tsx` has a local `titleCase(slug)`. The species-filter labels must render identically to that page's header, so share one helper.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/slug.test.ts`:

```ts
import { titleCaseSlug } from "./slug";

describe("titleCaseSlug", () => {
	test("title-cases a hyphenated species slug", () => {
		expect(titleCaseSlug("rhydon")).toBe("Rhydon");
		expect(titleCaseSlug("mr-mime")).toBe("Mr Mime");
		expect(titleCaseSlug("nidoran-f")).toBe("Nidoran F");
	});
});
```

(If `src/lib/slug.test.ts` lacks a `describe`/`test`/`expect` import from `bun:test`, add it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/slug.test.ts`
Expected: FAIL — `titleCaseSlug` is not exported.

- [ ] **Step 3: Add the helper to `src/lib/slug.ts`**

```ts
/** Title-case a hyphenated slug for display ("mr-mime" → "Mr Mime"). */
export function titleCaseSlug(slug: string): string {
	return slug
		.split("-")
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join(" ");
}
```

- [ ] **Step 4: Use it in the pokemon route**

In `src/routes/pokemon/$name.tsx`: delete the local `titleCase` function (lines defining `function titleCase(slug: string)`), import the shared helper, and replace the call site `titleCase(params.name)` with `titleCaseSlug(params.name)`.

Add to the imports:

```ts
import { titleCaseSlug } from "../../lib/slug";
```

- [ ] **Step 5: Run tests + typecheck to verify**

Run: `bun test src/lib/slug.test.ts && bunx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/slug.ts src/lib/slug.test.ts src/routes/pokemon/\$name.tsx
git commit -m "refactor(slug): extract shared titleCaseSlug, reuse in pokemon route"
```

---

## Task 4: Derive species facet options

**Files:**
- Modify: `src/server/set-facets.ts`
- Test: `src/server/set-facets.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/server/set-facets.test.ts`:

```ts
describe("deriveFacets pokemon", () => {
	const dexName = (n: number) =>
		({ 6: "charizard", 25: "pikachu", 112: "rhydon" })[n] ?? null;

	test("distinct species from cards, alphabetized, labeled via resolver", () => {
		const f = deriveFacets(
			[
				c({ name: "Brock's Rhydon", nationalPokedexNumbers: [112] }),
				c({ name: "Rhydon", nationalPokedexNumbers: [112] }),
				c({ name: "Charizard", nationalPokedexNumbers: [6] }),
			],
			dexName,
		);
		expect(f.pokemon).toEqual([
			{ dex: 6, name: "Charizard" },
			{ dex: 112, name: "Rhydon" },
		]);
	});

	test("cards without a dex contribute no species option", () => {
		const f = deriveFacets(
			[c({ name: "Potion", supertype: "Trainer" })],
			dexName,
		);
		expect(f.pokemon).toEqual([]);
	});

	test("multi-dex card contributes an option per species", () => {
		const f = deriveFacets(
			[c({ name: "Pikachu & Zekrom", nationalPokedexNumbers: [25, 644] })],
			dexName,
		);
		// Order-agnostic: the sort is by display label and 644 is unresolved by
		// the stub, so assert membership rather than a locale-dependent order.
		expect(f.pokemon.map((p) => p.dex).sort((a, b) => a - b)).toEqual([25, 644]);
		expect(f.pokemon.find((p) => p.dex === 25)?.name).toBe("Pikachu");
		expect(f.pokemon.find((p) => p.dex === 644)?.name).toBe("#644");
	});

	test("no resolver → #<dex> labels", () => {
		const f = deriveFacets([
			c({ name: "Rhydon", nationalPokedexNumbers: [112] }),
		]);
		expect(f.pokemon).toEqual([{ dex: 112, name: "#112" }]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/set-facets.test.ts`
Expected: FAIL — `f.pokemon` is undefined.

- [ ] **Step 3: Implement**

In `src/server/set-facets.ts`:

```ts
import { titleCaseSlug } from "@/lib/slug";

export interface PokemonFacet {
	dex: number;
	name: string;
}

export interface SetFacets {
	supertypes: string[];
	subtypes: string[];
	rarities: string[];
	types: string[];
	pokemon: PokemonFacet[];
}
```

Add a pokemon-options builder and call it from `deriveFacets`:

```ts
/** Distinct species (by national dex number) present in the cards, alphabetized. */
function derivePokemon(
	cards: HoloCardData[],
	dexName?: (dex: number) => string | null | undefined,
): PokemonFacet[] {
	const dexes = [
		...new Set(cards.flatMap((c) => c.nationalPokedexNumbers ?? [])),
	];
	return dexes
		.map((dex) => {
			const resolved = dexName?.(dex);
			return {
				dex,
				name: resolved ? titleCaseSlug(resolved) : `#${dex}`,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function deriveFacets(
	cards: HoloCardData[],
	dexName?: (dex: number) => string | null | undefined,
): SetFacets {
	return {
		supertypes: sortedDistinct(cards.map((c) => c.supertype)),
		subtypes: sortedDistinct(cards.flatMap((c) => c.subtypes ?? [])),
		rarities: sortedDistinct(cards.map((c) => c.rarity)),
		types: sortedDistinct(cards.flatMap((c) => c.types ?? [])),
		pokemon: derivePokemon(cards, dexName),
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/set-facets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/set-facets.ts src/server/set-facets.test.ts
git commit -m "feat(facets): derive available-species options keyed by dex number"
```

---

## Task 5: Wire the species list into the route loaders

**Files:**
- Modify: `src/routes/search.tsx`
- Modify: `src/routes/$series/$set/index.tsx`

Both loaders fetch the cached species list and pass a `dex → name` resolver into `deriveFacets` so labels are SSR-correct. `nameByDex(list, dex)` lives in `src/server/pokemon-dex.ts`; `getPokemonListFn` in `src/server/card-data.ts`.

- [ ] **Step 1: Search route — derive facets in the loader**

In `src/routes/search.tsx`:

Add imports:

```ts
import { getPokemonListFn } from "../server/card-data";
import { nameByDex } from "../server/pokemon-dex";
```

Change the loader to fetch the species list and return `facets`. Replace the existing loader body with:

```ts
	loader: async ({ deps }) => {
		const q = deps.q.trim();
		if (!q) return { q, cards: [], total: 0, facets: deriveFacets([]) };
		const [all, list] = await Promise.all([
			searchCardsFn({ data: { query: q, mode: deps.mode } }),
			getPokemonListFn(),
		]);
		const cards = all.slice(0, 40);
		const facets = deriveFacets(cards, (dex) => nameByDex(list, dex));
		return { q, cards, total: all.length, facets };
	},
```

In `SearchPage`, remove the in-component `const options = deriveFacets(cards);` and read it from loader data instead:

```ts
	const { q, cards, total, facets } = Route.useLoaderData();
```

Pass `options={facets}` everywhere `options` was passed (the `SearchPageInner` `options` prop and the `<SearchControls>`), and add `showPokemonFilter` on the `<SearchControls>` (done in Task 6). The `deriveFacets` import stays (used in the loader). Remove the now-unused `deriveFacets(cards)` call.

- [ ] **Step 2: Set route — pass the resolver to the loader's deriveFacets**

In `src/routes/$series/$set/index.tsx`:

Add imports:

```ts
import { getPokemonListFn } from "../../../server/card-data";
import { nameByDex } from "../../../server/pokemon-dex";
```

In the loader, fetch the list alongside the set cards and pass the resolver:

```ts
		const [all, list] = await Promise.all([
			getSetCardsFn({ data: set.id }),
			getPokemonListFn(),
		]);
		const slugs = buildSetCardSlugs(all);
		const cards = all.map((c) => ({
			...c,
			slug: slugs.slugById.get(c.id) ?? c.id,
		}));
		return { set, cards, facets: deriveFacets(all, (dex) => nameByDex(list, dex)) };
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc -b`
Expected: no errors. (`facets` already flows to `SearchControls` on both routes.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/search.tsx src/routes/\$series/\$set/index.tsx
git commit -m "feat(routes): resolve species facet labels in search + set loaders"
```

---

## Task 6: Render the Pokémon filter select

**Files:**
- Modify: `src/components/islands/search-controls.tsx`
- Modify: `src/routes/search.tsx` (add `showPokemonFilter`)
- Modify: `src/routes/$series/$set/index.tsx` (add `showPokemonFilter`)

- [ ] **Step 1: Add a `PokemonFilterSelect` + prop to `SearchControls`**

In `src/components/islands/search-controls.tsx`:

Import the facet type:

```ts
import type { PokemonFacet, SetFacets } from "@/server/set-facets";
```

Add to `SearchControlsProps`:

```ts
	/** When true, renders the Pokémon (species) filter select. Defaults to false. */
	showPokemonFilter?: boolean;
```

Add the component (mirrors `FilterSelect`/`YearSelect`; value is a dex number, `"__all__"` sentinel clears):

```tsx
function PokemonFilterSelect({
	value,
	options,
	onChange,
}: {
	value: number | null;
	options: PokemonFacet[];
	onChange: (v: number | null) => void;
}) {
	const ALL = "__all__";
	return (
		<Select
			value={value != null ? String(value) : ALL}
			onValueChange={(v) => onChange(v === ALL ? null : Number(v))}
		>
			<SelectTrigger className="text-sm w-full" aria-label="Pokémon">
				<SelectValue placeholder="Pokémon" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL}>All Pokémon</SelectItem>
				{options.map((p) => (
					<SelectItem key={p.dex} value={String(p.dex)}>
						{p.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
```

Update the function signature to accept `showPokemonFilter = false`, widen the filter grid from `sm:grid-cols-5` to `sm:grid-cols-6`, and render the select after the Energy-type `FilterSelect` (before the owned `Select`):

```tsx
				{showPokemonFilter && (
					<PokemonFilterSelect
						value={value.pokemon}
						options={options.pokemon}
						onChange={(pokemon) => onChange({ pokemon })}
					/>
				)}
```

Change the grid wrapper class:

```tsx
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
```

- [ ] **Step 2: Enable the filter on the two routes**

In `src/routes/search.tsx`, the `<SearchControls>` already has `showYearFilter`; add `showPokemonFilter`:

```tsx
					<SearchControls
						value={search}
						options={options}
						onChange={onChange}
						placeholder="Search all cards"
						showYearFilter
						showPokemonFilter
					/>
```

In `src/routes/$series/$set/index.tsx`, find the `<SearchControls ... />` and add `showPokemonFilter`.

- [ ] **Step 3: Typecheck + lint**

Run: `bunx tsc -b && bunx biome check --config-path=. --write src/components/islands/search-controls.tsx src/routes/search.tsx 'src/routes/$series/$set/index.tsx'`
Expected: no type errors; biome clean.

- [ ] **Step 4: Verify in the browser (preview)**

Start the dev server and confirm:
- On `/search?q=charizard`, the filter row shows a "Pokémon" select; opening it lists species present in results; choosing one narrows the grid; "All Pokémon" clears it; the choice round-trips in the URL (`?pokemon=6`).
- On a set page (`/<series>/<set>`), the "Pokémon" select lists every species in that set.
- On `/pokemon/<name>`, the "Pokémon" select is absent.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/search-controls.tsx src/routes/search.tsx src/routes/\$series/\$set/index.tsx
git commit -m "feat(search): render Pokémon species filter on search + set pages"
```

---

## Task 7: Capture the species selection into binder smart-rules

**Files:**
- Modify: `src/lib/serialized-query.ts`
- Test: `src/lib/serialized-query.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/serialized-query.test.ts`:

```ts
import { LIST_SEARCH_DEFAULTS } from "./list-search";

test("captures search.pokemon into dexNumber", () => {
	const q = toSerializedQuery({ ...LIST_SEARCH_DEFAULTS, pokemon: 112 }, {});
	expect(q.dexNumber).toBe(112);
});

test("dex context still wins over the pokemon filter", () => {
	const q = toSerializedQuery(
		{ ...LIST_SEARCH_DEFAULTS, pokemon: 112 },
		{ dexNumber: 6 },
	);
	expect(q.dexNumber).toBe(6);
});
```

(If the file already imports `toSerializedQuery`/`bun:test`, don't re-import.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/serialized-query.test.ts`
Expected: FAIL — `dexNumber` is `null` when only `pokemon` is set.

- [ ] **Step 3: Implement**

In `src/lib/serialized-query.ts` `toSerializedQuery`, change the `dexNumber` line:

```ts
		dexNumber: ctx.dexNumber ?? search.pokemon ?? null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/serialized-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/serialized-query.ts src/lib/serialized-query.test.ts
git commit -m "feat(binders): capture pokemon species filter into smart-rule dexNumber"
```

---

## Final verification

- [ ] **Run lint + typecheck + the affected tests together**

```bash
bunx tsc -b
bun test src/lib src/server
bunx biome check --config-path=. src/lib src/server src/components/islands/search-controls.tsx src/routes
```

Expected: typecheck clean, tests green, biome clean.

- [ ] **Manual smoke (preview):** species filter narrows the grid on `/search` and a set page, round-trips in the URL, and a search-page species selection saved as a binder rule shows the species name in the rule label.

---

## Notes / gotchas

- **No `corpus-engine.ts` change.** `queryCorpus` already filters `card.nationalPokedexNumbers?.includes(q.dexNumber)`. The whole feature rides that field.
- **`buildFilterClauses` (`src/utils/build-filter-clauses.ts`) is dead** (only referenced by its own test) — do not add a clause there.
- **Seed-limited options on `/search`:** species options come from the top-40 seed (same as the other filters). The set route derives over the whole set, so its options are complete. This is intended (see spec Non-goals).
- **Tests must not hit the network** — none of the new unit tests render a card grid, so no `useCorpusRuntime.setState` seeding is needed. The route loaders are not unit-tested here (verified via typecheck + preview).

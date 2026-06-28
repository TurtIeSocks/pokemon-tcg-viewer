# SortControl on card pages — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-facing sorting to every card list page — a `Default · Dex # · Card # · Name · Release date` sort, asc/desc, persisted in the URL — by wiring `sort`/`dir` through the shared card query pipeline and dropping the reusable `SortControl` into the card `ResultsBar`.

**Architecture:** `ListSearch` gains `sort` + `dir` (URL-backed like every other filter). `buildCorpusQuery` forwards them to `CorpusQuery`; `queryCorpus`'s comparator gets an explicit-sort branch where a non-`default` mode overrides the existing relevance/chronological/number ordering. A thin `CardSortControl` wraps the generic `SortControl` (from Phase 1) and is added after the Timeline toggle in the four `ResultsBar` consumers. The card grid already re-queries on any `search` change, so no grid change is needed.

**Tech Stack:** React 19, TanStack Start/Router, Bun test + happy-dom, the in-memory corpus engine.

## Global Constraints

- Tests use `bun:test` + happy-dom; never hit the network. Radix DropdownMenus are opened in tests with `fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })` (the codebase idiom; plain `click` silently fails in happy-dom).
- Codebase indents with TABS. After writing, run `bunx biome check --config-path=. --write <files>`.
- No em-dashes in user-facing copy (sort labels). Sort mode internal value is `number`; its **label is "Card #"**.
- **Reuse** the Phase-1 `SortControl` (`@/components/sort-control`) and `SortDir`/`SortOption` (`@/lib/sort`). Do not build a new control.
- **"Default" sort must preserve the current ordering exactly** — relevance when searching, release-date across sets, collector-number within a set. Existing `queryCorpus` order tests must stay green unchanged.
- `ListSearch.sort`/`dir` are **required** fields (like `mode`/`pokemon`): every `ListSearch` object literal must include them. Defaults: `sort: "default"`, `dir: "asc"`.
- Manual `useMemo`/`useState` are intentional (React Compiler on).

---

### Task 1: `ListSearch` gains `sort` + `dir` (types, defaults, validate, URL)

**Files:**
- Modify: `src/lib/card-query.ts` (add `CardSortMode`, `ListSearch` fields, `CARD_SORT_OPTIONS`, `naturalCardDir`)
- Modify: `src/lib/list-search.ts` (defaults, validate, URL serialize)
- Test: `src/lib/list-search.test.ts` (append sort/dir cases)
- Fix (type fallout): `src/components/islands/search-controls.test.tsx`, `src/components/islands/card-grid-island.test.tsx`, `src/components/binders/binder-detail.test.tsx`, `src/lib/serialized-query.test.ts` — add `sort: "default", dir: "asc"` to each `ListSearch` literal (run `tsc -b` to find every one).

**Interfaces:**
- Consumes: `SortDir`, `SortOption` (`./sort`).
- Produces: `type CardSortMode = "default" | "dex" | "number" | "name" | "released"`; `ListSearch` += `sort: CardSortMode` + `dir: SortDir`; `CARD_SORT_OPTIONS: SortOption<CardSortMode>[]`; `naturalCardDir(): SortDir`.

- [ ] **Step 1: Write the failing test (append to `src/lib/list-search.test.ts`)**

```ts
// append to src/lib/list-search.test.ts
import { listSearchToUrl, validateListSearch } from "./list-search"; // (already imported — keep one copy)

test("sort: defaults to 'default' and dir to 'asc'", () => {
	expect(LIST_SEARCH_DEFAULTS.sort).toBe("default");
	expect(LIST_SEARCH_DEFAULTS.dir).toBe("asc");
});
test("sort: validates the modes from the URL, else 'default'", () => {
	expect(validateListSearch({ sort: "name" }).sort).toBe("name");
	expect(validateListSearch({ sort: "dex" }).sort).toBe("dex");
	expect(validateListSearch({ sort: "number" }).sort).toBe("number");
	expect(validateListSearch({ sort: "released" }).sort).toBe("released");
	expect(validateListSearch({ sort: "junk" }).sort).toBe("default");
});
test("dir: validates 'desc', else 'asc'", () => {
	expect(validateListSearch({ dir: "desc" }).dir).toBe("desc");
	expect(validateListSearch({ dir: "nonsense" }).dir).toBe("asc");
});
test("sort/dir: defaults stripped from URL; non-defaults serialized", () => {
	expect(listSearchToUrl({ sort: "default" }).sort).toBeUndefined();
	expect(listSearchToUrl({ sort: "name" }).sort).toBe("name");
	expect(listSearchToUrl({ dir: "asc" }).dir).toBeUndefined();
	expect(listSearchToUrl({ dir: "desc" }).dir).toBe("desc");
});
test("sort: full round-trip serialize → parse", () => {
	expect(validateListSearch(listSearchToUrl({ sort: "released" })).sort).toBe(
		"released",
	);
});
```

(If `validateListSearch`/`listSearchToUrl` are already imported at the top of the file, do not re-import — use the existing import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/list-search.test.ts`
Expected: FAIL (`sort`/`dir` undefined on defaults / not validated).

- [ ] **Step 3: Add the type + options to `src/lib/card-query.ts`**

Add the import and the sort type/options near the top, and the two fields to `ListSearch`:

```ts
// add to the imports:
import type { SortDir, SortOption } from "./sort";

// NOTE: this union must stay in sync with the inline `sort` union on CorpusQuery
// in src/store/corpus/corpus-engine.ts (kept inline there to avoid a type cycle).
export type CardSortMode = "default" | "dex" | "number" | "name" | "released";

/** Sort modes offered by the card pages' SortControl. */
export const CARD_SORT_OPTIONS: SortOption<CardSortMode>[] = [
	{ value: "default", label: "Default" },
	{ value: "dex", label: "Dex #" },
	{ value: "number", label: "Card #" },
	{ value: "name", label: "Name" },
	{ value: "released", label: "Release date" },
];

/** Natural direction when switching card sort mode (all ascending). */
export function naturalCardDir(): SortDir {
	return "asc";
}
```

In the `ListSearch` interface, add the two fields (after `mode`):

```ts
	/** Search mode: "exact" (whole name), "contains" (prefix+substring), or "fuzzy" (default). */
	mode: SearchMode;
	/** Explicit sort; "default" keeps the context order (relevance/release/number). */
	sort: CardSortMode;
	/** Sort direction for an explicit `sort` ("default" ignores it). */
	dir: SortDir;
```

(Leave `buildCorpusQuery` unchanged in this task — it gains sort/dir forwarding in Task 2.)

- [ ] **Step 4: Wire defaults + validate + URL in `src/lib/list-search.ts`**

Add the import, the two defaults, the validation, and the URL serialization.

```ts
// add to imports:
import type { CardSortMode, ListSearch, OwnedMode, ViewMode } from "./card-query";
import type { SortDir } from "./sort";
```

In `LIST_SEARCH_DEFAULTS`, add after `mode: "fuzzy"`:

```ts
	mode: "fuzzy",
	sort: "default",
	dir: "asc",
```

In `validateListSearch`'s returned object, add after the `mode` field:

```ts
		mode: ((): SearchMode => {
			const m = search.mode;
			if (m === "exact" || m === "contains" || m === "fuzzy") return m;
			return "fuzzy";
		})(),
		sort: ((): CardSortMode => {
			const s = search.sort;
			return s === "dex" || s === "number" || s === "name" || s === "released"
				? s
				: "default";
		})(),
		dir: (search.dir === "desc" ? "desc" : "asc") as SortDir,
```

In `listSearchToUrl`, add before the final `return out;`:

```ts
	// Omit "default"/"asc" so crawlable URLs stay clean.
	if (s.sort !== undefined) out.sort = s.sort !== "default" ? s.sort : undefined;
	if (s.dir !== undefined) out.dir = s.dir !== "asc" ? s.dir : undefined;
```

- [ ] **Step 5: Fix the broken `ListSearch` test literals**

Run `bunx tsc -b` — it flags every `ListSearch` literal missing the new required fields. Add `sort: "default",` and `dir: "asc",` to each. Known sites: `search-controls.test.tsx` (`defaultValue`), `card-grid-island.test.tsx` (its literal), `binder-detail.test.tsx` (two literals), `serialized-query.test.ts` (`baseSearch()`).

- [ ] **Step 6: Run tests + typecheck + biome**

Run (parallel): `bunx tsc -b` · `bunx biome check --config-path=. --write src/lib/card-query.ts src/lib/list-search.ts src/lib/list-search.test.ts` · `bun test src/lib/list-search.test.ts src/lib/card-query.test.ts src/lib/serialized-query.test.ts`
Expected: clean typecheck, no lint, all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/card-query.ts src/lib/list-search.ts src/lib/list-search.test.ts src/components/islands/search-controls.test.tsx src/components/islands/card-grid-island.test.tsx src/components/binders/binder-detail.test.tsx src/lib/serialized-query.test.ts
git commit -m "feat(card-query): add sort + dir to ListSearch (URL-backed, default-stripped)"
```

---

### Task 2: `queryCorpus` honors `sort`/`dir`; `buildCorpusQuery` forwards them

**Files:**
- Modify: `src/store/corpus/corpus-engine.ts` (`CorpusQuery` fields + `queryCorpus` comparator)
- Modify: `src/lib/card-query.ts` (`buildCorpusQuery` forwards `sort`/`dir`)
- Test: `src/store/corpus/corpus-engine.test.ts` (append sort cases); `src/lib/card-query.test.ts` (append forwarding)

**Interfaces:**
- Consumes: `ListSearch.sort`/`dir` (Task 1); `SortDir` (`../../lib/sort`); `compareCardNumber` (already imported).
- Produces: `CorpusQuery` += `sort?` + `dir?`; `queryCorpus` orders by explicit sort when set; `buildCorpusQuery` returns `sort`/`dir` in every branch.

- [ ] **Step 1: Write the failing tests**

Append to `src/store/corpus/corpus-engine.test.ts` (uses the existing `index`/`setsById` fixtures: `base1-2` Blastoise #2, `base1-4` Charizard #4, `swsh1-25` Charizard V #25, `base1-58` Pikachu #58/dex25; base1=1999, swsh1=2020):

```ts
test("sort name: asc alphabetical, desc reversed", () => {
	expect(
		queryCorpus(index, { sort: "name", dir: "asc", relevance: false }, setsById).map(
			(c) => c.id,
		),
	).toEqual(["base1-2", "base1-4", "swsh1-25", "base1-58"]);
	expect(
		queryCorpus(index, { sort: "name", dir: "desc", relevance: false }, setsById).map(
			(c) => c.id,
		),
	).toEqual(["base1-58", "swsh1-25", "base1-4", "base1-2"]);
});
test("sort released desc puts the newest set first, base1 cards tie-break by number", () => {
	expect(
		queryCorpus(
			index,
			{ sort: "released", dir: "desc", relevance: false },
			setsById,
		).map((c) => c.id),
	).toEqual(["swsh1-25", "base1-2", "base1-4", "base1-58"]);
});
test("sort dex asc puts dex-bearing cards first (others sentinel-last)", () => {
	expect(
		queryCorpus(index, { sort: "dex", dir: "asc", relevance: false }, setsById).map(
			(c) => c.id,
		),
	).toEqual(["base1-58", "base1-2", "base1-4", "swsh1-25"]);
});
test("sort default preserves the existing card-number order", () => {
	expect(
		queryCorpus(
			index,
			{ sort: "default", dir: "asc", relevance: false },
			setsById,
		).map((c) => c.id),
	).toEqual(["base1-2", "base1-4", "swsh1-25", "base1-58"]);
});
```

Append to `src/lib/card-query.test.ts`:

```ts
test("forwards sort + dir to the corpus query", () => {
	const q = buildCorpusQuery(
		{ ...empty, sort: "name", dir: "desc" },
		{},
	);
	expect(q.sort).toBe("name");
	expect(q.dir).toBe("desc");
});
test("default sort still forwards (engine treats it as the context order)", () => {
	expect(buildCorpusQuery(empty, {}).sort).toBe("default");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/corpus/corpus-engine.test.ts src/lib/card-query.test.ts`
Expected: FAIL (`sort`/`dir` not honored / not forwarded).

- [ ] **Step 3: Add `sort`/`dir` to `CorpusQuery` + the comparator branch in `src/store/corpus/corpus-engine.ts`**

Add the `SortDir` import:

```ts
import type { SortDir } from "../../lib/sort";
```

In the `CorpusQuery` interface, add (after `mode`):

```ts
	/**
	 * Explicit user sort. "default"/undefined keeps the context order (relevance /
	 * release-date / number). Union kept inline (must match CardSortMode in
	 * src/lib/card-query.ts) to avoid a type cycle with that module.
	 */
	sort?: "default" | "dex" | "number" | "name" | "released";
	dir?: SortDir;
```

In `queryCorpus`, replace the `hits.sort(...)` block. Keep the existing `relAt` line; add the explicit-sort branch first:

```ts
	const relAt = (id: string) => setsById.get(id)?.releaseDate ?? "";
	const DEX_LAST = Number.MAX_SAFE_INTEGER;

	hits.sort((a, b) => {
		// Explicit user sort (SortControl) overrides relevance/chronological order.
		if (q.sort && q.sort !== "default") {
			const sign = q.dir === "desc" ? -1 : 1;
			let c = 0;
			if (q.sort === "name") c = a.card.name.localeCompare(b.card.name);
			else if (q.sort === "number")
				c = compareCardNumber(a.card.number, b.card.number);
			else if (q.sort === "released")
				c = relAt(a.card.setId).localeCompare(relAt(b.card.setId));
			else if (q.sort === "dex")
				c =
					(a.card.nationalPokedexNumbers?.[0] ?? DEX_LAST) -
					(b.card.nationalPokedexNumbers?.[0] ?? DEX_LAST);
			if (c !== 0) return sign * c;
			// Stable, direction-independent tie-break.
			return compareCardNumber(a.card.number, b.card.number);
		}
		if (q.relevance && a.match && b.match) {
			if (a.match.tier !== b.match.tier) return a.match.tier - b.match.tier;
			if (a.match.tier === 3 && a.match.distance !== b.match.distance)
				return a.match.distance - b.match.distance;
			if (a.card.name.length !== b.card.name.length)
				return a.card.name.length - b.card.name.length;
		}
		const ra = relAt(a.card.setId);
		const rb = relAt(b.card.setId);
		if (q.dexNumber != null || q.relevance || q.chronological) {
			if (ra !== rb) return ra.localeCompare(rb);
		}
		return compareCardNumber(a.card.number, b.card.number);
	});
```

- [ ] **Step 4: Forward `sort`/`dir` in `buildCorpusQuery` (`src/lib/card-query.ts`)**

Every `return { ... }` branch in `buildCorpusQuery` must include `sort: s.sort` and `dir: s.dir`. Add both lines next to the existing `mode,` line in each of the four return objects (set context, dex context, supertype-anchored, and the final global return). Example for the final return:

```ts
	return {
		setId: null,
		dexNumber: s.pokemon ?? undefined,
		query,
		filters,
		yearMin,
		yearMax,
		mode,
		sort: s.sort,
		dir: s.dir,
		relevance: !!query,
	};
```

(Apply the same `sort: s.sort, dir: s.dir,` addition to the `setId`, `dexNumber`, and `ctx.supertype` return branches.)

- [ ] **Step 5: Run tests + typecheck + biome**

Run (parallel): `bunx tsc -b` · `bunx biome check --config-path=. --write src/store/corpus/corpus-engine.ts src/lib/card-query.ts src/store/corpus/corpus-engine.test.ts src/lib/card-query.test.ts` · `bun test src/store/corpus/corpus-engine.test.ts src/lib/card-query.test.ts`
Expected: clean typecheck, no lint, all PASS — including the **pre-existing** order tests (set browse, relevance, chronological) unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/store/corpus/corpus-engine.ts src/lib/card-query.ts src/store/corpus/corpus-engine.test.ts src/lib/card-query.test.ts
git commit -m "feat(corpus): queryCorpus honors explicit sort + dir; default preserves order"
```

---

### Task 3: `CardSortControl` wrapper

**Files:**
- Create: `src/components/islands/card-sort-control.tsx`
- Test: `src/components/islands/card-sort-control.test.tsx`

**Interfaces:**
- Consumes: `SortControl` (`@/components/sort-control`); `CARD_SORT_OPTIONS`, `naturalCardDir`, `ListSearch` (`../../lib/card-query`).
- Produces: `CardSortControl({ value, onChange })` — binds the generic `SortControl` to `ListSearch.sort`/`dir`, disabling the direction toggle for the "Default" mode.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/islands/card-sort-control.test.tsx
import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import { CardSortControl } from "./card-sort-control";

function renderControl(overrides = {}, onChange = () => {}) {
	return render(
		<CardSortControl
			value={{ ...LIST_SEARCH_DEFAULTS, ...overrides }}
			onChange={onChange}
		/>,
	);
}

test("shows the active sort label and offers the card sort modes", async () => {
	renderControl({ sort: "name" });
	expect(screen.getByRole("button", { name: "Sort by" }).textContent).toContain(
		"Name",
	);
	fireEvent.pointerDown(screen.getByRole("button", { name: "Sort by" }), {
		button: 0,
		ctrlKey: false,
	});
	expect(await screen.findByRole("menuitemradio", { name: "Release date" }))
		.toBeDefined();
	expect(screen.getByRole("menuitemradio", { name: "Card #" })).toBeDefined();
});

test("selecting a mode fires onChange with sort + reset dir asc", async () => {
	const onChange = mock(() => {});
	renderControl({ sort: "default" }, onChange);
	fireEvent.pointerDown(screen.getByRole("button", { name: "Sort by" }), {
		button: 0,
		ctrlKey: false,
	});
	fireEvent.click(await screen.findByRole("menuitemradio", { name: "Name" }));
	expect(onChange).toHaveBeenCalledWith({ sort: "name", dir: "asc" });
});

test("toggling direction fires onChange with dir", () => {
	const onChange = mock(() => {});
	renderControl({ sort: "name", dir: "asc" }, onChange);
	fireEvent.click(screen.getByRole("button", { name: "Sort ascending" }));
	expect(onChange).toHaveBeenCalledWith({ dir: "desc" });
});

test("the direction toggle is disabled for the Default mode", () => {
	renderControl({ sort: "default" });
	expect(
		(screen.getByRole("button", { name: "Sort ascending" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/islands/card-sort-control.test.tsx`
Expected: FAIL (cannot find module `./card-sort-control`).

- [ ] **Step 3: Write the component**

```tsx
// src/components/islands/card-sort-control.tsx
import { SortControl } from "@/components/sort-control";
import {
	CARD_SORT_OPTIONS,
	type ListSearch,
	naturalCardDir,
} from "../../lib/card-query";

/**
 * Binds the generic SortControl to a card page's ListSearch sort/dir. Lives in
 * the ResultsBar after the Timeline toggle; the direction toggle is disabled in
 * the "Default" mode (which has no meaningful direction).
 */
export function CardSortControl({
	value,
	onChange,
}: {
	value: ListSearch;
	onChange: (patch: Partial<ListSearch>) => void;
}) {
	return (
		<SortControl
			mode={value.sort}
			dir={value.dir}
			options={CARD_SORT_OPTIONS}
			dirDisabled={value.sort === "default"}
			onModeChange={(sort) => onChange({ sort, dir: naturalCardDir() })}
			onDirChange={(dir) => onChange({ dir })}
		/>
	);
}
```

- [ ] **Step 4: Run test + biome**

Run: `bunx biome check --config-path=. --write src/components/islands/card-sort-control.tsx src/components/islands/card-sort-control.test.tsx` then `bun test src/components/islands/card-sort-control.test.tsx`
Expected: lint clean, 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/card-sort-control.tsx src/components/islands/card-sort-control.test.tsx
git commit -m "feat(card): CardSortControl binding SortControl to ListSearch sort/dir"
```

---

### Task 4: Add `CardSortControl` to the four card ResultsBars

**Files:**
- Modify: `src/components/card/card-list-page.tsx` (after `ViewModeToggle`)
- Modify: `src/routes/search.tsx` (after `ViewModeToggle`)
- Modify: `src/routes/pokemon/$name.tsx` (after `ViewModeToggle`)
- Modify: `src/routes/$series/$set/index.tsx` (after the existing actions; this ResultsBar has no Timeline)

**Interfaces:**
- Consumes: `CardSortControl` (Task 3). Each page already has `search: ListSearch` + an `onChange: (patch: Partial<ListSearch>) => void` in scope.

> No unit test: each edit adds one already-tested element into an existing ResultsBar. Verified in the preview (Step 3), consistent with the codebase's untested route/page files.

- [ ] **Step 1: Add the control in each consumer**

In `src/components/card/card-list-page.tsx`, import and add it after `ViewModeToggle` inside the `ResultsBar`:

```tsx
import { CardSortControl } from "../islands/card-sort-control";
```
```tsx
					<ViewModeToggle
						value={search.view}
						disabled={false}
						onChange={(view) => onChange({ view })}
					/>
					<CardSortControl value={search} onChange={onChange} />
```

In `src/routes/search.tsx`, after its `ViewModeToggle` in the `ResultsBar`:

```tsx
import { CardSortControl } from "../components/islands/card-sort-control";
```
```tsx
				<ViewModeToggle ... />
				<CardSortControl value={search} onChange={onChange} />
```

In `src/routes/pokemon/$name.tsx`, after its `ViewModeToggle`:

```tsx
import { CardSortControl } from "../../components/islands/card-sort-control";
```
```tsx
				<ViewModeToggle ... />
				<CardSortControl value={search} onChange={onChange} />
```

In `src/routes/$series/$set/index.tsx`, inside the ResultsBar's `<ClientOnly>` block, after the "Open Packs" `Button` (this page has no Timeline toggle):

```tsx
import { CardSortControl } from "../../../components/islands/card-sort-control";
```
```tsx
					<Button variant="outline" size="sm" onClick={() => setPackOpen(true)}>
						<Package className="size-4 sm:mr-2" />
						<span className="hidden sm:inline">Open Packs</span>
					</Button>
					<CardSortControl value={search} onChange={onChange} />
```

- [ ] **Step 2: Typecheck + biome + the affected suites**

Run (parallel): `bunx tsc -b` · `bunx biome check --config-path=. --write src/components/card/card-list-page.tsx src/routes/search.tsx src/routes/pokemon/$name.tsx "src/routes/\$series/\$set/index.tsx"` · `bun test src/components src/lib src/store/corpus`
Expected: clean typecheck (the gitignored `routeTree.gen.ts` regenerates when the dev server boots in Step 3), no lint, all tests pass.

- [ ] **Step 3: Verify in the preview**

Boot `bun run dev` (port 6201). Via the preview tools, on `/trainer`: confirm the `[ Default ▾ | ↑ ]` SortControl sits after the Timeline pill in the ResultsBar; selecting "Name" re-sorts the grid alphabetically and writes `?sort=name` to the URL; toggling direction reverses it and writes `?sort=name&dir=desc`; reload preserves the order. Spot-check `/search?q=char` and a set page (`/base/base1`) too. Screenshot the result.

- [ ] **Step 4: Commit**

```bash
git add src/components/card/card-list-page.tsx src/routes/search.tsx src/routes/pokemon/$name.tsx "src/routes/\$series/\$set/index.tsx"
git commit -m "feat(card): SortControl in the card ResultsBar on all list pages"
```

---

## Self-Review

**Spec coverage (Phase 2):**
- `ListSearch` += `sort`/`dir` (defaults, validate, URL) → Task 1.
- `queryCorpus` honors sort/dir; "Default" preserves order → Task 2 (comparator) + the unchanged pre-existing order tests.
- `buildCorpusQuery` forwards sort/dir → Task 2.
- Card sort modes Default · Dex # · Card # · Name · Release date → Task 1 (`CARD_SORT_OPTIONS`, "Card #" label).
- SortControl in the card ResultsBar after Timeline on all list pages → Task 4 (CardListPage covers trainer/energy + $name; search; set; pokemon/$name).
- URL-backed, default-stripped → Task 1 (`listSearchToUrl`), verified live in Task 4.

**Placeholder scan:** none. The one untested task (Task 4) is justified inline (one tested element per consumer; preview-verified).

**Type consistency:** `CardSortMode` (Task 1, card-query.ts) is mirrored by the inline `sort` union on `CorpusQuery` (Task 2, corpus-engine.ts) — both note the dependency in a comment. `ListSearch.sort`/`dir` (Task 1) are consumed by `buildCorpusQuery` (Task 2) and `CardSortControl` (Task 3). `CARD_SORT_OPTIONS`/`naturalCardDir` (Task 1) are consumed by `CardSortControl` (Task 3). `CardSortControl({ value, onChange })` (Task 3) matches the four call sites (Task 4), each passing `search` + `onChange`. The generic `SortControl` props (`mode`/`dir`/`options`/`onModeChange`/`onDirChange`/`dirDisabled`) are unchanged from Phase 1.

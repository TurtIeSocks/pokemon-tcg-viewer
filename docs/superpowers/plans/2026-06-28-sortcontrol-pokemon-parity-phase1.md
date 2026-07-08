# SortControl + `/pokemon` parity — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `/pokemon` Pokédex directory to card-page parity — a reusable `SortControl` group-button, an Exact/Contains/Fuzzy search-mode selector wired to species matching, and a `"{N} species"` ResultsBar.

**Architecture:** A generic presentational `SortControl` (`[ Mode ▾ | ↑↓ ]` ButtonGroup) plus shared sort types in `src/lib/sort.ts`. `/pokemon`'s `PokedexFilter` gains `searchMode` and replaces its single `sort` field with `sortMode` + `sortDir`; `applyPokedexFilter` matches species names through the corpus `matchName` engine and sorts by mode+direction. The route renders `PokedexControls` (search + SearchModeMenu + filters) and a `ResultsBar` holding the `SortControl`.

**Tech Stack:** React 19, TanStack Start, Bun test + happy-dom + `@testing-library/react`, Radix (DropdownMenu), Tailwind v4, lucide icons.

## Global Constraints

- Tests use `bun:test` + happy-dom; never hit the network. Radix dropdowns are driven in tests via `fireEvent.click(trigger)` then `findByRole("menuitemradio", …)` (see `src/components/islands/search-controls.test.tsx`).
- Codebase indents with TABS. After writing, run `bunx biome check --config-path=. --write <files>`.
- No em-dashes in user-facing copy (labels, titles). Use periods/commas.
- **Reuse** `SearchModeMenu` (`@/components/islands/search-mode-menu`), `ResultsBar` (`@/components/results-bar`), and the corpus matcher `matchName`/`normalize` (`@/store/corpus/fuzzy`). Do NOT write a new matcher.
- **Pre-extract non-component exports:** shared sort *types* live in `src/lib/sort.ts`, never exported from the `.tsx` component (avoids `react-refresh/only-export-components`).
- Manual `useMemo`/`useState` are intentional (React Compiler on) — keep them.
- No Zustand store changes in Phase 1 (`PokedexControls` keeps its existing `useUiPrefs` per-field selectors).
- `matchName(q, name, tokens, mode)` takes **normalized** strings: `q = normalize(query)`, `name = normalize(row.name)`, `tokens = row.name.split(/[\s-]+/).flatMap(t => normalize(t) ? [normalize(t)] : [])`. Empty `q` matches all. `SearchMode = "exact" | "contains" | "fuzzy"`.

---

### Task 1: `SortControl` component + shared sort types

**Files:**
- Create: `src/lib/sort.ts`
- Create: `src/components/sort-control.tsx`
- Test: `src/components/sort-control.test.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/ui/button`), `ButtonGroup` (`@/components/ui/button-group`), `DropdownMenu*` (`@/components/ui/dropdown-menu`), lucide `ArrowUp`/`ArrowDown`/`ChevronDown`.
- Produces: `type SortDir = "asc" | "desc"`, `interface SortOption<T>`, `interface SortControlProps<T>` (in `src/lib/sort.ts`); `SortControl<T extends string>(props: SortControlProps<T>)` (in `sort-control.tsx`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/sort-control.test.tsx
import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SortOption } from "../lib/sort";
import { SortControl } from "./sort-control";

const options: SortOption<"dex" | "name">[] = [
	{ value: "dex", label: "Dex #" },
	{ value: "name", label: "Name" },
];

test("shows the active mode label and toggles direction", () => {
	const onDir = mock(() => {});
	render(
		<SortControl
			mode="dex"
			dir="asc"
			options={options}
			onModeChange={() => {}}
			onDirChange={onDir}
		/>,
	);
	expect(screen.getByRole("button", { name: "Sort by" }).textContent).toContain(
		"Dex #",
	);
	fireEvent.click(screen.getByRole("button", { name: "Sort ascending" }));
	expect(onDir).toHaveBeenCalledWith("desc");
});

test("selecting a mode fires onModeChange", async () => {
	const onMode = mock(() => {});
	render(
		<SortControl
			mode="dex"
			dir="asc"
			options={options}
			onModeChange={onMode}
			onDirChange={() => {}}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Sort by" }));
	fireEvent.click(await screen.findByRole("menuitemradio", { name: "Name" }));
	expect(onMode).toHaveBeenCalledWith("name");
});

test("dirDisabled disables the direction toggle", () => {
	render(
		<SortControl
			mode="dex"
			dir="asc"
			options={options}
			onModeChange={() => {}}
			onDirChange={() => {}}
			dirDisabled
		/>,
	);
	expect(
		(screen.getByRole("button", { name: "Sort ascending" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/sort-control.test.tsx`
Expected: FAIL (cannot find module `./sort-control`).

- [ ] **Step 3: Write the shared types**

```ts
// src/lib/sort.ts

/** Sort direction shared by every sortable list. */
export type SortDir = "asc" | "desc";

/** One selectable sort mode in a SortControl. */
export interface SortOption<T extends string> {
	value: T;
	label: string;
}

export interface SortControlProps<T extends string> {
	mode: T;
	dir: SortDir;
	options: SortOption<T>[];
	onModeChange: (mode: T) => void;
	onDirChange: (dir: SortDir) => void;
	/** Disable the direction toggle (e.g. a "Default" mode with no direction). */
	dirDisabled?: boolean;
}
```

- [ ] **Step 4: Write the component**

```tsx
// src/components/sort-control.tsx
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SortControlProps } from "@/lib/sort";

const TRIGGER_CLASS =
	"border-(--border) bg-(--glass) text-(--ink-muted) hover:bg-white/[0.07] hover:text-(--ink)";

/**
 * Two fused segments — a sort-mode dropdown and an ASC/DESC toggle — in the
 * ButtonGroup style of the ResultsBar actions. Presentational: the consumer
 * owns state and decides any direction reset on mode change.
 */
export function SortControl<T extends string>({
	mode,
	dir,
	options,
	onModeChange,
	onDirChange,
	dirDisabled = false,
}: SortControlProps<T>) {
	const active = options.find((o) => o.value === mode) ?? options[0];
	const asc = dir === "asc";
	return (
		<ButtonGroup>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						aria-label="Sort by"
						title={`Sort by ${active?.label ?? ""}`}
						className={TRIGGER_CLASS}
					>
						<span>{active?.label}</span>
						<ChevronDown className="size-4 opacity-70" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuRadioGroup
						value={mode}
						onValueChange={(v) => onModeChange(v as T)}
					>
						{options.map((o) => (
							<DropdownMenuRadioItem key={o.value} value={o.value}>
								{o.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={dirDisabled}
				aria-label={asc ? "Sort ascending" : "Sort descending"}
				title={
					asc
						? "Ascending (click for descending)"
						: "Descending (click for ascending)"
				}
				onClick={() => onDirChange(asc ? "desc" : "asc")}
				className={TRIGGER_CLASS}
			>
				{asc ? (
					<ArrowUp className="size-4" />
				) : (
					<ArrowDown className="size-4" />
				)}
			</Button>
		</ButtonGroup>
	);
}
```

- [ ] **Step 5: Run test + biome**

Run: `bunx biome check --config-path=. --write src/lib/sort.ts src/components/sort-control.tsx src/components/sort-control.test.tsx` then `bun test src/components/sort-control.test.tsx`
Expected: lint clean, 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sort.ts src/components/sort-control.tsx src/components/sort-control.test.tsx
git commit -m "feat(ui): reusable SortControl group-button (mode dropdown + asc/desc)"
```

---

### Task 2: `PokedexFilter` — search mode + sort mode/direction

**Files:**
- Modify: `src/lib/pokedex.ts`
- Test: `src/lib/pokedex.test.ts`

**Interfaces:**
- Consumes: `SortDir`, `SortOption` (`./sort`, Task 1); `matchName`, `normalize`, `SearchMode` (`../store/corpus/fuzzy`).
- Produces: `type PokedexSortMode = "dex" | "name" | "count"`; updated `interface PokedexFilter` (`query`, `searchMode`, `type`, `generation`, `sortMode`, `sortDir`); `POKEDEX_FILTER_DEFAULTS`; `naturalPokedexDir(mode): SortDir`; `POKEDEX_SORT_OPTIONS: SortOption<PokedexSortMode>[]`; updated `applyPokedexFilter(rows, filter)`.

- [ ] **Step 1: Replace the filter tests (update the existing `applyPokedexFilter` block)**

Replace the current `import` line and the `describe("applyPokedexFilter", …)` block in `src/lib/pokedex.test.ts` with:

```ts
// import line:
import {
	applyPokedexFilter,
	GENERATIONS,
	generationOf,
	naturalPokedexDir,
	POKEDEX_FILTER_DEFAULTS,
	type PokedexRow,
	pokedexTypeOptions,
	spriteUrl,
} from "./pokedex";
```

```ts
// replace the describe("applyPokedexFilter", …) block:
describe("applyPokedexFilter", () => {
	const rows: PokedexRow[] = [
		{ dex: 6, name: "charizard", count: 9, type: "Fire" },
		{ dex: 25, name: "pikachu", count: 30, type: "Lightning" },
		{ dex: 152, name: "chikorita", count: 4, type: "Grass" },
	];
	const f = (over: Partial<typeof POKEDEX_FILTER_DEFAULTS> = {}) => ({
		...POKEDEX_FILTER_DEFAULTS,
		...over,
	});

	test("defaults return every row in ascending dex order", () => {
		expect(applyPokedexFilter(rows, f()).map((r) => r.dex)).toEqual([
			6, 25, 152,
		]);
	});
	test("fuzzy query matches a near name; numeric query matches by dex", () => {
		expect(applyPokedexFilter(rows, f({ query: "charizar" }))).toEqual([
			rows[0],
		]);
		expect(applyPokedexFilter(rows, f({ query: "25" }))).toEqual([rows[1]]);
	});
	test("exact search mode requires the whole name", () => {
		expect(applyPokedexFilter(rows, f({ query: "char", searchMode: "exact" })))
			.toEqual([]);
		expect(
			applyPokedexFilter(rows, f({ query: "charizard", searchMode: "exact" })),
		).toEqual([rows[0]]);
	});
	test("type and generation filters still apply", () => {
		expect(applyPokedexFilter(rows, f({ type: "Grass" }))).toEqual([rows[2]]);
		expect(
			applyPokedexFilter(rows, f({ generation: "Gen 2" })).map((r) => r.dex),
		).toEqual([152]);
	});
	test("sort by name respects direction", () => {
		expect(
			applyPokedexFilter(rows, f({ sortMode: "name", sortDir: "asc" })).map(
				(r) => r.name,
			),
		).toEqual(["charizard", "chikorita", "pikachu"]);
		expect(
			applyPokedexFilter(rows, f({ sortMode: "name", sortDir: "desc" })).map(
				(r) => r.name,
			),
		).toEqual(["pikachu", "chikorita", "charizard"]);
	});
	test("sort by count desc lists most cards first; asc least first", () => {
		expect(
			applyPokedexFilter(rows, f({ sortMode: "count", sortDir: "desc" })).map(
				(r) => r.dex,
			),
		).toEqual([25, 6, 152]);
		expect(
			applyPokedexFilter(rows, f({ sortMode: "count", sortDir: "asc" })).map(
				(r) => r.dex,
			),
		).toEqual([152, 6, 25]);
	});
	test("sort by dex desc reverses the order", () => {
		expect(
			applyPokedexFilter(rows, f({ sortMode: "dex", sortDir: "desc" })).map(
				(r) => r.dex,
			),
		).toEqual([152, 25, 6]);
	});
});

describe("naturalPokedexDir", () => {
	test("count defaults to desc, others to asc", () => {
		expect(naturalPokedexDir("count")).toBe("desc");
		expect(naturalPokedexDir("dex")).toBe("asc");
		expect(naturalPokedexDir("name")).toBe("asc");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/pokedex.test.ts`
Expected: FAIL (`naturalPokedexDir` not exported; `PokedexFilter` lacks `searchMode`/`sortMode`/`sortDir`).

- [ ] **Step 3: Rewrite the filter section of `src/lib/pokedex.ts`**

Add the import at the top:

```ts
import { matchName, normalize, type SearchMode } from "../store/corpus/fuzzy";
import type { SortDir, SortOption } from "./sort";
```

Replace the existing `PokedexSort` / `PokedexFilter` / `POKEDEX_FILTER_DEFAULTS` / `applyPokedexFilter` definitions with:

```ts
export type PokedexSortMode = "dex" | "name" | "count";

/** Active directory filter + sort. `null` on a dimension = no filter on it. */
export interface PokedexFilter {
	query: string;
	searchMode: SearchMode;
	type: string | null;
	generation: string | null;
	sortMode: PokedexSortMode;
	sortDir: SortDir;
}

export const POKEDEX_FILTER_DEFAULTS: PokedexFilter = {
	query: "",
	searchMode: "fuzzy",
	type: null,
	generation: null,
	sortMode: "dex",
	sortDir: "asc",
};

/** Sort modes offered by the /pokemon SortControl. */
export const POKEDEX_SORT_OPTIONS: SortOption<PokedexSortMode>[] = [
	{ value: "dex", label: "Dex #" },
	{ value: "name", label: "Name" },
	{ value: "count", label: "Card Count" },
];

/** Natural default direction when the user switches sort mode. */
export function naturalPokedexDir(mode: PokedexSortMode): SortDir {
	return mode === "count" ? "desc" : "asc";
}

const tokensOf = (name: string): string[] =>
	name.split(/[\s-]+/).flatMap((t) => {
		const n = normalize(t);
		return n ? [n] : [];
	});

// A row matches when its name matches under the search mode, or the (numeric)
// query is a substring of its dex number. Empty query matches everything.
function matchesQuery(
	row: PokedexRow,
	query: string,
	mode: SearchMode,
): boolean {
	const q = normalize(query);
	if (!q) return true;
	if (matchName(q, normalize(row.name), tokensOf(row.name), mode) != null)
		return true;
	return String(row.dex).includes(query.trim());
}

/** Apply the search + type + generation filters, then sort by mode + direction. */
export function applyPokedexFilter(
	rows: PokedexRow[],
	f: PokedexFilter,
): PokedexRow[] {
	const gen = f.generation
		? (GENERATIONS.find((g) => g.label === f.generation) ?? null)
		: null;
	const out = rows.filter((r) => {
		if (!matchesQuery(r, f.query, f.searchMode)) return false;
		if (f.type && r.type !== f.type) return false;
		if (gen && !(r.dex >= gen.start && r.dex <= gen.end)) return false;
		return true;
	});
	const sign = f.sortDir === "asc" ? 1 : -1;
	if (f.sortMode === "name")
		out.sort((a, b) => sign * a.name.localeCompare(b.name));
	else if (f.sortMode === "count")
		out.sort((a, b) => sign * (a.count - b.count) || a.dex - b.dex);
	else out.sort((a, b) => sign * (a.dex - b.dex));
	return out;
}
```

(Leave `PokedexRow`, `spriteUrl`, `GENERATIONS`, `generationOf`, `pokedexTypeOptions` unchanged. Delete the old `PokedexSort` type.)

- [ ] **Step 4: Run tests + biome**

Run: `bunx biome check --config-path=. --write src/lib/pokedex.ts src/lib/pokedex.test.ts` then `bun test src/lib/pokedex.test.ts`
Expected: lint clean, all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pokedex.ts src/lib/pokedex.test.ts
git commit -m "feat(pokedex): search-mode matching + sort mode/direction in the filter"
```

---

### Task 3: `PokedexControls` — add the search-mode selector, drop the in-panel sort

**Files:**
- Modify: `src/components/pokedex/pokedex-controls.tsx`
- Test: `src/components/pokedex/pokedex-controls.test.tsx`

**Interfaces:**
- Consumes: `SearchModeMenu` (`@/components/islands/search-mode-menu`); the updated `PokedexFilter` (Task 2).
- Produces: `PokedexControls({ value, typeOptions, onChange })` — same props, but `value` is the new `PokedexFilter` and the sort `Select` is removed (sort now lives in the route's ResultsBar).

- [ ] **Step 1: Update the test**

Replace `src/components/pokedex/pokedex-controls.test.tsx` so it no longer expects a Sort dropdown and asserts the search-mode menu instead. Full file:

```tsx
import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { POKEDEX_FILTER_DEFAULTS, type PokedexFilter } from "../../lib/pokedex";
import { PokedexControls } from "./pokedex-controls";

const typeOptions = ["Fire", "Grass", "Water"];

function renderControls({
	value = POKEDEX_FILTER_DEFAULTS,
	onChange = () => {},
}: {
	value?: PokedexFilter;
	onChange?: (p: Partial<PokedexFilter>) => void;
} = {}) {
	return render(
		<PokedexControls
			value={value}
			typeOptions={typeOptions}
			onChange={onChange}
		/>,
	);
}

test("renders the search box, search-mode menu, and Type + Generation dropdowns", () => {
	renderControls();
	expect(screen.getByRole("searchbox")).toBeDefined();
	expect(screen.getByRole("button", { name: "Search mode" })).toBeDefined();
	expect(screen.getByRole("combobox", { name: "Type" })).toBeDefined();
	expect(screen.getByRole("combobox", { name: "Generation" })).toBeDefined();
});

test("there is no Sort dropdown in the controls (it lives in the ResultsBar)", () => {
	renderControls();
	expect(screen.queryByRole("combobox", { name: "Sort" })).toBeNull();
});

test("typing in the search box fires onChange with the query", () => {
	const onChange = mock(() => {});
	renderControls({ onChange });
	fireEvent.change(screen.getByRole("searchbox"), {
		target: { value: "char" },
	});
	expect(onChange).toHaveBeenCalledWith({ query: "char" });
});

test("changing the search mode fires onChange with searchMode", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange });
	fireEvent.click(screen.getByRole("button", { name: "Search mode" }));
	fireEvent.click(await screen.findByRole("menuitemradio", { name: /exact/i }));
	expect(onChange).toHaveBeenCalledWith({ searchMode: "exact" });
});

test("selecting a generation fires onChange with that generation label", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange });
	fireEvent.click(screen.getByRole("combobox", { name: "Generation" }));
	fireEvent.click(await screen.findByRole("option", { name: "Gen 3" }));
	expect(onChange).toHaveBeenCalledWith({ generation: "Gen 3" });
});

test("active-filter badge counts Type + Generation only", () => {
	renderControls({
		value: {
			...POKEDEX_FILTER_DEFAULTS,
			query: "pika",
			type: "Fire",
			generation: "Gen 1",
		},
	});
	expect(
		screen.getByRole("button", { name: "Toggle filters" }).textContent,
	).toContain("2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/pokedex/pokedex-controls.test.tsx`
Expected: FAIL ("Search mode" button not found; the Sort combobox still present / `searchMode` not wired).

- [ ] **Step 3: Edit `pokedex-controls.tsx`**

Add the import:

```ts
import { SearchModeMenu } from "@/components/islands/search-mode-menu";
```

Remove the now-unused sort imports/consts: delete the `PokedexSort` import usage, the `SORTS` array, and the entire sort `<Select>` block in `CollapsibleContent`. Update the `lib/pokedex` import to drop `PokedexSort` and keep `GENERATIONS` + `PokedexFilter`.

Inside the `ButtonGroup`, add the search-mode menu between the `Input` and the `CollapsibleTrigger`:

```tsx
<Input
	type="search"
	defaultValue={value.query}
	placeholder="Search species by name or dex number..."
	aria-label="Search species by name or dex number"
	onChange={(e) => onChange({ query: e.target.value })}
	className="min-w-0 border-(--border) bg-(--glass)"
/>
<SearchModeMenu
	value={value.searchMode}
	onChange={(searchMode) => onChange({ searchMode })}
/>
<CollapsibleTrigger
	aria-label="Toggle filters"
	/* …unchanged… */
>
```

Replace the `CollapsibleContent` grid so it holds only the Type and Generation selects (drop the sort Select); keep `NullableSelect` as-is:

```tsx
<CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none">
	<div className="grid grid-cols-2 gap-2 pt-3">
		<NullableSelect
			label="Type"
			allLabel="All types"
			value={value.type}
			options={typeOptions}
			onChange={(type) => onChange({ type })}
		/>
		<NullableSelect
			label="Generation"
			allLabel="All generations"
			value={value.generation}
			options={GENERATIONS.map((g) => g.label)}
			onChange={(generation) => onChange({ generation })}
		/>
	</div>
</CollapsibleContent>
```

The `onChange` prop type stays `(patch: Partial<PokedexFilter>) => void` — `PokedexFilter` now includes `searchMode`, so `{ searchMode }` patches type-check. The `Select`/`SelectContent`/`SelectItem`/`SelectValue` imports are still used by `NullableSelect`; leave them. Remove `SelectTrigger` only if it becomes unused (it is still used by `NullableSelect`, so keep it).

- [ ] **Step 4: Run test + biome**

Run: `bunx biome check --config-path=. --write src/components/pokedex/pokedex-controls.tsx src/components/pokedex/pokedex-controls.test.tsx` then `bun test src/components/pokedex/pokedex-controls.test.tsx`
Expected: lint clean, all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/pokedex/pokedex-controls.tsx src/components/pokedex/pokedex-controls.test.tsx
git commit -m "feat(pokedex): add the Exact/Contains/Fuzzy search-mode selector; move sort out of the panel"
```

---

### Task 4: Route wiring + ResultsBar `unit` prop

**Files:**
- Modify: `src/components/results-bar.tsx`
- Modify: `src/routes/pokemon/index.tsx`

**Interfaces:**
- Consumes: `SortControl` (Task 1); `applyPokedexFilter`, `naturalPokedexDir`, `POKEDEX_FILTER_DEFAULTS`, `POKEDEX_SORT_OPTIONS`, `pokedexTypeOptions`, `PokedexFilter`, `PokedexSortMode` (Task 2); `PokedexControls` (Task 3); `ResultsBar`.
- Produces: `ResultsBar` gains optional `unit?: string` (default `"cards"`); the `/pokemon` route renders the controls + a `"{N} species"` ResultsBar holding the SortControl.

> No unit test: the route is thin wiring over already-tested units and the `ResultsBar` change is a one-line label tweak. Verified in the preview (Step 4), consistent with the codebase's untested route files.

- [ ] **Step 1: Add the `unit` prop to `ResultsBar`**

In `src/components/results-bar.tsx`, add the prop and use it in the label:

```tsx
export function ResultsBar({
	count,
	unit = "cards",
	children,
}: {
	/** Item count shown as "{count} {unit}"; `null` hides it. */
	count: number | null;
	/** Noun for the count label. Defaults to "cards". */
	unit?: string;
	/** Right-aligned actions. */
	children: ReactNode;
}) {
	return (
		<div className="mb-3 flex items-center gap-3">
			{count != null && (
				<span className="font-mono text-sm tabular-nums text-(--ink-muted)">
					{count} {unit}
				</span>
			)}
			<div className="ml-auto flex items-center gap-2">{children}</div>
		</div>
	);
}
```

- [ ] **Step 2: Rewrite `src/routes/pokemon/index.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PokedexControls } from "../../components/pokedex/pokedex-controls";
import { PokedexGrid } from "../../components/pokedex/pokedex-grid";
import { ResultsBar } from "../../components/results-bar";
import { SortControl } from "../../components/sort-control";
import {
	applyPokedexFilter,
	naturalPokedexDir,
	POKEDEX_FILTER_DEFAULTS,
	POKEDEX_SORT_OPTIONS,
	type PokedexFilter,
	type PokedexSortMode,
	pokedexTypeOptions,
} from "../../lib/pokedex";
import { getPokedexFn } from "../../server/corpus-server";

export const Route = createFileRoute("/pokemon/")({
	loader: () => getPokedexFn(),
	head: ({ loaderData }) => ({
		meta: [
			{ title: "Pokédex · every Pokémon TCG card by species" },
			{
				name: "description",
				content: `Browse ${loaderData?.length ?? ""} Pokémon species and find every TCG card of each.`,
			},
			{ property: "og:title", content: "Pokédex · Pokémon TCG by species" },
		],
	}),
	component: PokedexPage,
});

function PokedexPage() {
	const rows = Route.useLoaderData();
	const [filter, setFilter] = useState<PokedexFilter>(POKEDEX_FILTER_DEFAULTS);
	const typeOptions = useMemo(() => pokedexTypeOptions(rows), [rows]);
	const visible = useMemo(
		() => applyPokedexFilter(rows, filter),
		[rows, filter],
	);

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 shrink-0">
				<PokedexControls
					value={filter}
					typeOptions={typeOptions}
					onChange={(patch) => setFilter((f) => ({ ...f, ...patch }))}
				/>
			</div>
			<div className="shrink-0">
				<ResultsBar count={visible.length} unit="species">
					<SortControl
						mode={filter.sortMode}
						dir={filter.sortDir}
						options={POKEDEX_SORT_OPTIONS}
						onModeChange={(sortMode: PokedexSortMode) =>
							setFilter((f) => ({
								...f,
								sortMode,
								sortDir: naturalPokedexDir(sortMode),
							}))
						}
						onDirChange={(sortDir) => setFilter((f) => ({ ...f, sortDir }))}
					/>
				</ResultsBar>
			</div>
			<div className="min-h-0 flex-1">
				<PokedexGrid rows={visible} />
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Typecheck + biome + the pokedex/home suites**

Run (parallel): `bunx tsc -b` · `bunx biome check --config-path=. --write src/components/results-bar.tsx src/routes/pokemon/index.tsx` · `bun test src/components/pokedex src/components/sort-control.test.tsx src/lib/pokedex.test.ts src/routes/index.test.tsx src/components/home/home-browse.test.tsx`
Expected: clean typecheck (the gitignored `routeTree.gen.ts` regenerates when the dev server boots in Step 4), no lint errors, all tests pass.

- [ ] **Step 4: Verify in the preview**

Boot `bun run dev` (port 6201). Via the preview tools, on `/pokemon`: confirm the search-mode selector (Fuzzy) sits in the search bar; the `"{N} species"` ResultsBar shows with the `[ Dex # ▾ | ↑ ]` SortControl; selecting "Card Count" flips direction to descending and reorders (Pikachu first); the direction toggle reverses it; an Exact-mode search of a partial name yields no match while the full name matches. Screenshot the result.

- [ ] **Step 5: Commit**

```bash
git add src/components/results-bar.tsx src/routes/pokemon/index.tsx
git commit -m "feat(pokemon): species ResultsBar + SortControl; ResultsBar gains a unit label"
```

---

## Self-Review

**Spec coverage (Phase 1):**
- Reusable `SortControl` (mode dropdown + asc/desc) → Task 1.
- Search-mode selector on `/pokemon` + species matching via `matchName` → Task 2 (`applyPokedexFilter`) + Task 3 (`SearchModeMenu`).
- ResultsBar `"{N} species"` + SortControl, sort moved out of the panel → Task 4 (route) + Task 3 (panel sort removed).
- Species sort modes Dex #/Name/Card Count + natural-default-dir reset → Task 2 (`POKEDEX_SORT_OPTIONS`, `naturalPokedexDir`) + Task 4 (route reset on mode change).

**Placeholder scan:** none — every code step is complete; Task 4's untested route+label is justified inline per the no-network rule and codebase convention.

**Type consistency:** `PokedexFilter` (Task 2: `query`/`searchMode`/`type`/`generation`/`sortMode`/`sortDir`) is consumed unchanged in Tasks 3-4. `SortDir`/`SortOption`/`SortControlProps` (Task 1, `lib/sort.ts`) are consumed by `SortControl` and by `POKEDEX_SORT_OPTIONS`/`naturalPokedexDir` (Task 2). `SortControl` props (`mode`/`dir`/`options`/`onModeChange`/`onDirChange`/`dirDisabled`) match the route's usage in Task 4. `naturalPokedexDir(mode)` and `POKEDEX_SORT_OPTIONS` names match across Tasks 2 and 4. `ResultsBar`'s new `unit` prop (Task 4) is backward-compatible (defaults to `"cards"`, so existing card-page call sites are unaffected).

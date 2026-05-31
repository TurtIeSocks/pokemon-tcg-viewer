# Home, Recents & Search Scope — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search-first Home (recent searches + recently viewed cards, backed by a localStorage Zustand store), set-scoped search with an all-sets toggle, a filter menu behind a button, and remove the toolbar set-name / add sidebar release years.

**Architecture:** A new standalone `useRecentsStore` (Zustand `persist` → localStorage) holds recents. `BrowsePage` renders `Home` when no set is selected and no query; otherwise the set/search grid. A `scope` URL param drives set-scoped vs global search. The search input is extracted to a shared `SearchInput` used by both Home and the in-set `SearchBar`.

**Tech Stack:** React 19, React Router 7, Zustand 5 (+ persist middleware), Tailwind v4, shadcn/ui, react-virtuoso, Bun test (happy-dom).

**Spec:** [docs/superpowers/specs/2026-05-30-home-and-search-scope-design.md](../specs/2026-05-30-home-and-search-scope-design.md)

## File Structure

**New**
- `src/store/recents.ts` (+ `recents.test.ts`) — localStorage-persisted recents store.
- `src/components/search-bar/search-input.tsx` — shared search box (debounce + autocomplete + recent-search capture).
- `src/components/search-bar/filter-menu.tsx` — Filter button + panel (replaces the popover row).
- `src/components/search-bar/scope-toggle.tsx` — This set / All sets segmented control.
- `src/pages/home.tsx` — search-first landing.

**Modified**
- `src/hooks/use-url-selection.ts` (+ `useScopeParam`; test in `use-url-selection.test.tsx`).
- `src/utils/group-sets-by-series.ts` (+ `year` on `SeriesGroup`; test).
- `src/api.ts` (`getCardsBySet` gains optional `name` for set-scoped search).
- `src/components/search-bar/search-bar.tsx` (compose SearchInput + FilterMenu + ScopeToggle).
- `src/pages/browse-page.tsx` (Home branch, scope-aware fetcher + cacheKey, content header, drop auto-newest-select).
- `src/components/app-shell/toolbar.tsx` (remove the current-set block).
- `src/components/series-sidebar/series-sidebar.tsx` + `series-sidebar-item.tsx` (show year).
- `src/components/card-dialog/card-dialog.tsx` (record recently viewed on open).

**Removed (after verifying orphaned)**
- `src/components/search-bar/filter-popover.tsx` (+ test) — superseded by filter-menu.
- `src/utils/pick-newest-set.ts` (+ test) — no longer used for defaulting.

**Conventions:** TAB indentation; `@/` → `src/`. Tests: `bun test <path>`. Typecheck: `bun run typecheck`. Lint one file: `bunx biome check --config-path=. --write <path>`.

---

### Task 1: Recents store (TDD)

**Files:** Create `src/store/recents.ts`, `src/store/recents.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import type { HoloCardData } from "../components/holo-card";
import { useRecentsStore } from "./recents";

const card = (id: string): HoloCardData => ({
	id,
	imageUrl: "",
	name: id,
	supertype: "Pokémon",
	setId: "s",
	setName: "S",
	setSeries: "X",
	cardNumber: "1",
});

beforeEach(() => {
	useRecentsStore.setState({ recentSearches: [], recentlyViewed: [] });
});

describe("addRecentSearch", () => {
	it("dedupes and moves to front, newest-first", () => {
		const { addRecentSearch } = useRecentsStore.getState();
		addRecentSearch("pikachu");
		addRecentSearch("charizard");
		addRecentSearch("pikachu");
		expect(useRecentsStore.getState().recentSearches).toEqual([
			"pikachu",
			"charizard",
		]);
	});
	it("ignores empty / whitespace", () => {
		useRecentsStore.getState().addRecentSearch("   ");
		expect(useRecentsStore.getState().recentSearches).toEqual([]);
	});
	it("caps at 10, newest first", () => {
		const { addRecentSearch } = useRecentsStore.getState();
		for (let i = 0; i < 15; i++) addRecentSearch(`q${i}`);
		const r = useRecentsStore.getState().recentSearches;
		expect(r).toHaveLength(10);
		expect(r[0]).toBe("q14");
	});
});

describe("addRecentlyViewed", () => {
	it("dedupes by id, newest-first", () => {
		const { addRecentlyViewed } = useRecentsStore.getState();
		addRecentlyViewed(card("a"));
		addRecentlyViewed(card("b"));
		addRecentlyViewed(card("a"));
		expect(useRecentsStore.getState().recentlyViewed.map((c) => c.id)).toEqual([
			"a",
			"b",
		]);
	});
	it("caps at 24", () => {
		const { addRecentlyViewed } = useRecentsStore.getState();
		for (let i = 0; i < 30; i++) addRecentlyViewed(card(`c${i}`));
		expect(useRecentsStore.getState().recentlyViewed).toHaveLength(24);
	});
});

describe("clearRecentSearches", () => {
	it("empties searches but keeps viewed", () => {
		const s = useRecentsStore.getState();
		s.addRecentSearch("x");
		s.addRecentlyViewed(card("a"));
		s.clearRecentSearches();
		expect(useRecentsStore.getState().recentSearches).toEqual([]);
		expect(useRecentsStore.getState().recentlyViewed).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test src/store/recents.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HoloCardData } from "../components/holo-card";

const MAX_SEARCHES = 10;
const MAX_VIEWED = 24;

interface RecentsState {
	recentSearches: string[];
	recentlyViewed: HoloCardData[];
	addRecentSearch: (q: string) => void;
	addRecentlyViewed: (card: HoloCardData) => void;
	clearRecentSearches: () => void;
}

/**
 * Lightweight UI state (recent searches + recently viewed cards), persisted to
 * localStorage via Zustand's persist middleware. Kept separate from the IDB
 * domain store (src/store/index.ts) which holds cards/collection/cache.
 */
export const useRecentsStore = create<RecentsState>()(
	persist(
		(set) => ({
			recentSearches: [],
			recentlyViewed: [],
			addRecentSearch: (q) => {
				const trimmed = q.trim();
				if (!trimmed) return;
				set((s) => ({
					recentSearches: [
						trimmed,
						...s.recentSearches.filter((x) => x !== trimmed),
					].slice(0, MAX_SEARCHES),
				}));
			},
			addRecentlyViewed: (card) =>
				set((s) => ({
					recentlyViewed: [
						card,
						...s.recentlyViewed.filter((c) => c.id !== card.id),
					].slice(0, MAX_VIEWED),
				})),
			clearRecentSearches: () => set({ recentSearches: [] }),
		}),
		{
			name: "ptcgv-recents",
			storage: createJSONStorage(() => localStorage),
			partialize: (s) => ({
				recentSearches: s.recentSearches,
				recentlyViewed: s.recentlyViewed,
			}),
		},
	),
);
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun test src/store/recents.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/recents.ts src/store/recents.test.ts
git commit -m "feat(store): recents store (localStorage-persisted)"
```

---

### Task 2: `useScopeParam` (TDD)

**Files:** Modify `src/hooks/use-url-selection.ts`; add tests to `src/hooks/use-url-selection.test.tsx`

- [ ] **Step 1: Write the failing test** — append to `use-url-selection.test.tsx`, following the existing render/wrapper pattern already used in that file for `useViewModeParam`. Match the existing helper (e.g. a MemoryRouter/renderHook wrapper) — read the top of the file and reuse it.

```tsx
import { useScopeParam } from "./use-url-selection";

// Uses the same router-wrapped renderHook helper already defined in this file
// for the other param hooks (e.g. `renderWithRouter` / `wrapper`).
test("useScopeParam defaults to 'set'", () => {
	const { result } = renderHookAt("/?setId=base1", () => useScopeParam());
	expect(result.current[0]).toBe("set");
});

test("useScopeParam reads 'all'", () => {
	const { result } = renderHookAt("/?setId=base1&scope=all", () => useScopeParam());
	expect(result.current[0]).toBe("all");
});

test("useScopeParam treats unknown values as 'set'", () => {
	const { result } = renderHookAt("/?scope=bogus", () => useScopeParam());
	expect(result.current[0]).toBe("set");
});
```

> Replace `renderHookAt(initialUrl, hook)` with whatever the file already uses to render a hook under a router at a given URL. If the file lacks one, add a minimal helper that wraps `renderHook` in a `createMemoryRouter`/`RouterProvider` at `initialEntries: [initialUrl]`.

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test src/hooks/use-url-selection.test.tsx`
Expected: FAIL — `useScopeParam` not exported.

- [ ] **Step 3: Implement** — add to `src/hooks/use-url-selection.ts` (mirrors `useViewModeParam`):

```ts
export type SearchScope = "set" | "all";
type SetScope = (scope: SearchScope, opts?: UpdateOptions) => void;

/**
 * URL-backed search scope. Default "set" (param omitted) means "search within
 * the selected set"; "all" serializes `scope=all` for a global name search.
 * Unknown values collapse to "set".
 */
export function useScopeParam(): [SearchScope, SetScope] {
	const [params, setParams] = useSearchParams();
	const scope: SearchScope = params.get("scope") === "all" ? "all" : "set";
	const setScope: SetScope = (next, opts) => {
		const p = new URLSearchParams(params);
		if (next === "all") p.set("scope", "all");
		else p.delete("scope");
		setParams(p, opts?.replace ? { replace: true } : undefined);
	};
	return [scope, setScope];
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun test src/hooks/use-url-selection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-url-selection.ts src/hooks/use-url-selection.test.tsx
git commit -m "feat(url): scope param for set-scoped vs global search"
```

---

### Task 3: Series release year (TDD)

**Files:** Modify `src/utils/group-sets-by-series.ts`, `src/utils/group-sets-by-series.test.ts`

- [ ] **Step 1: Write the failing test** — add to the existing test file:

```ts
it("exposes the earliest release year per series", () => {
	const mk = (id: string, series: string, releaseDate: string): PokemonSet => ({
		id,
		name: id,
		series,
		releaseDate,
		total: 1,
		images: { symbol: "", logo: "" },
	});
	const groups = groupSetsBySeries([
		mk("a", "Base", "2000/04/24"),
		mk("b", "Base", "1999/01/09"),
		mk("c", "Neo", "2000/12/16"),
	]);
	expect(groups.find((g) => g.series === "Base")?.year).toBe(1999);
	expect(groups.find((g) => g.series === "Neo")?.year).toBe(2000);
});
```

(`PokemonSet` is imported in that test file already; if not, `import type { PokemonSet } from "../api";`.)

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test src/utils/group-sets-by-series.test.ts`
Expected: FAIL — `year` undefined.

- [ ] **Step 3: Implement** — add `year` to `SeriesGroup`, track the min year while grouping:

```ts
export interface SeriesGroup {
	series: string;
	sets: PokemonSet[];
	/** Earliest release year among the series' sets (YYYY from releaseDate). */
	year: number;
}

export function groupSetsBySeries(sets: PokemonSet[]): SeriesGroup[] {
	const groups: SeriesGroup[] = [];
	const index = new Map<string, SeriesGroup>();
	for (const set of sets) {
		const year = Number(set.releaseDate.slice(0, 4));
		let group = index.get(set.series);
		if (!group) {
			group = { series: set.series, sets: [], year };
			index.set(set.series, group);
			groups.push(group);
		}
		group.sets.push(set);
		if (Number.isFinite(year) && year < group.year) group.year = year;
	}
	return groups;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun test src/utils/group-sets-by-series.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/group-sets-by-series.ts src/utils/group-sets-by-series.test.ts
git commit -m "feat(sidebar): earliest release year per series"
```

---

### Task 4: Set-scoped name search in the API (TDD)

**Files:** Modify `src/api.ts`; add a test to `src/api.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getCardsBySet } from "./api";

describe("getCardsBySet with name (set-scoped search)", () => {
	const realFetch = globalThis.fetch;
	let lastUrl = "";
	beforeEach(() => {
		lastUrl = "";
		globalThis.fetch = (async (url: string | URL) => {
			lastUrl = String(url);
			return new Response(JSON.stringify({ data: [], totalCount: 0 }), {
				status: 200,
			});
		}) as typeof fetch;
	});
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	it("scopes a name query to the set", async () => {
		await getCardsBySet("base1", 1, 20, {}, "pikachu");
		const decoded = decodeURIComponent(lastUrl);
		expect(decoded).toContain("set.id:base1");
		expect(decoded).toContain('name:"*pikachu*"');
	});

	it("omits the name clause when no name is given", async () => {
		await getCardsBySet("base1", 1, 20);
		const decoded = decodeURIComponent(lastUrl);
		expect(decoded).toContain("set.id:base1");
		expect(decoded).not.toContain("name:");
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test src/api.test.ts`
Expected: FAIL — `getCardsBySet` ignores the 5th arg / `name:` absent.

- [ ] **Step 3: Implement** — extend `getCardsBySet` in `src/api.ts` (it already imports `escapeLucene` and `buildFilterClauses`):

```ts
export function getCardsBySet(
	setId: string,
	page: number,
	pageSize: number,
	filters?: FilterClauses,
	name?: string,
): Promise<{ cards: HoloCardData[]; totalCount: number }> {
	const nameClause = name ? ` name:"*${escapeLucene(name)}*"` : "";
	return getCardsByQuery(
		`set.id:${setId}${nameClause}${buildFilterClauses(filters ?? {})}`,
		page,
		pageSize,
		"number",
	);
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun test src/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/api.test.ts
git commit -m "feat(api): optional set-scoped name search in getCardsBySet"
```

---

### Task 5: Shared `SearchInput` component

**Files:** Create `src/components/search-bar/search-input.tsx`

- [ ] **Step 1: Implement** — extract the input/autocomplete/debounce core from the current `search-bar.tsx`, and capture recent searches on commit.

```tsx
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePokemonList } from "../../hooks/use-pokemon-list";
import { useNameQueryParam } from "../../hooks/use-url-selection";
import { useRecentsStore } from "../../store/recents";
import { displayName } from "../../utils/display-name";

const MAX_SUGGESTIONS = 8;
const DEBOUNCE_MS = 300;

interface SearchInputProps {
	placeholder?: string;
	autoFocus?: boolean;
	className?: string;
}

export function SearchInput({
	placeholder = "Search cards by name (e.g. Pikachu, Charizard)",
	autoFocus,
	className,
}: SearchInputProps) {
	const [query, setQuery] = useNameQueryParam();
	const addRecentSearch = useRecentsStore((s) => s.addRecentSearch);
	const list = usePokemonList();

	const [text, setText] = useState(query);
	const [open, setOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastCommitted = useRef(query);

	useEffect(() => {
		if (query !== lastCommitted.current) {
			setText(query);
			lastCommitted.current = query;
		}
	}, [query]);
	useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

	const commit = (next: string) => {
		const trimmed = next.trim();
		lastCommitted.current = trimmed;
		setQuery(trimmed);
		if (trimmed) addRecentSearch(trimmed);
	};

	const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		const next = e.target.value;
		setText(next);
		setOpen(true);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => commit(next), DEBOUNCE_MS);
	};

	const suggestions =
		text.trim().length > 0
			? list
					.filter((p) => p.name.startsWith(text.trim().toLowerCase()))
					.slice(0, MAX_SUGGESTIONS)
			: [];

	const pick = (name: string) => {
		const display = displayName(name);
		setText(display);
		setOpen(false);
		if (timer.current) clearTimeout(timer.current);
		commit(display);
	};

	return (
		<div className={cn("relative", className)}>
			<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				value={text}
				onChange={onInput}
				// biome-ignore lint/a11y/noAutofocus: opt-in via prop, used only on the Home hero
				autoFocus={autoFocus}
				onFocus={() => setOpen(true)}
				onBlur={() => setTimeout(() => setOpen(false), 120)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						if (timer.current) clearTimeout(timer.current);
						commit(text);
						setOpen(false);
					} else if (e.key === "Escape") {
						setText("");
						commit("");
					}
				}}
				placeholder={placeholder}
				aria-label="Search cards by name"
				className="h-11 pl-10 pr-10"
			/>
			{text && (
				<Button
					variant="ghost"
					size="icon"
					onClick={() => {
						setText("");
						commit("");
					}}
					className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
					aria-label="Clear search"
				>
					<X className="size-4" />
				</Button>
			)}
			{open && suggestions.length > 0 && (
				<div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
					{suggestions.map((p) => (
						<button
							key={p.name}
							type="button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => pick(p.name)}
							className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-secondary"
						>
							{displayName(p.name)}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. --write src/components/search-bar/search-input.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/search-bar/search-input.tsx
git commit -m "feat(search): shared SearchInput (autocomplete + recent-search capture)"
```

---

### Task 6: Filter menu (button + panel)

**Files:** Create `src/components/search-bar/filter-menu.tsx`

- [ ] **Step 1: Implement** — a Filter button (active-count badge) opening a panel with the four dimensions as inline multi-selects. Keeps `useFilterParam` mechanics.

```tsx
import { Check, ListFilter } from "lucide-react";
import { useSearchParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useFilterValues } from "../../hooks/use-filter-values";
import { useFilterParam } from "../../hooks/use-url-selection";

function FilterGroup({
	label,
	paramName,
	options,
}: {
	label: string;
	paramName: string;
	options: string[];
}) {
	const [active, setActive] = useFilterParam(paramName);
	if (options.length === 0) return null;
	const toggle = (v: string) =>
		setActive(
			active.includes(v) ? active.filter((x) => x !== v) : [...active, v],
		);
	return (
		<div className="space-y-1">
			<div className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div className="flex flex-wrap gap-1">
				{options.map((opt) => (
					<button
						key={opt}
						type="button"
						onClick={() => toggle(opt)}
						className={cn(
							"flex items-center gap-1 rounded-full px-2.5 py-1 text-sm transition-colors",
							active.includes(opt)
								? "bg-primary text-primary-foreground"
								: "bg-secondary text-muted-foreground hover:text-foreground",
						)}
					>
						{active.includes(opt) && <Check className="size-3" />}
						{opt}
					</button>
				))}
			</div>
		</div>
	);
}

export function FilterMenu() {
	const [params, setParams] = useSearchParams();
	const values = useFilterValues();
	const [types] = useFilterParam("types");
	const [rarity] = useFilterParam("rarity");
	const [supertype] = useFilterParam("supertype");
	const [subtypes] = useFilterParam("subtypes");
	const activeCount =
		types.length + rarity.length + supertype.length + subtypes.length;

	const clearAll = () => {
		const next = new URLSearchParams(params);
		for (const key of ["types", "rarity", "supertype", "subtypes"]) {
			next.delete(key);
		}
		setParams(next);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant={activeCount ? "default" : "outline"} className="shrink-0">
					<ListFilter className="size-4 sm:mr-2" />
					<span className="hidden sm:inline">Filter</span>
					{activeCount > 0 && (
						<Badge variant="secondary" className="ml-2">
							{activeCount}
						</Badge>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-3">
				<ScrollArea className="max-h-[60vh]">
					<div className="space-y-3 pr-2">
						<FilterGroup label="Type" paramName="types" options={values.types} />
						<FilterGroup label="Rarity" paramName="rarity" options={values.rarities} />
						<FilterGroup label="Supertype" paramName="supertype" options={values.supertypes} />
						<FilterGroup label="Subtype" paramName="subtypes" options={values.subtypes} />
						{activeCount > 0 && (
							<Button variant="ghost" size="sm" onClick={clearAll} className="w-full">
								Clear all filters
							</Button>
						)}
					</div>
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. --write src/components/search-bar/filter-menu.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/search-bar/filter-menu.tsx
git commit -m "feat(filters): filter menu behind a button with active-count badge"
```

---

### Task 7: Scope toggle

**Files:** Create `src/components/search-bar/scope-toggle.tsx`

- [ ] **Step 1: Implement**

```tsx
import { cn } from "@/lib/utils";
import { type SearchScope, useScopeParam } from "../../hooks/use-url-selection";

const OPTIONS: { value: SearchScope; label: string }[] = [
	{ value: "set", label: "This set" },
	{ value: "all", label: "All sets" },
];

export function ScopeToggle() {
	const [scope, setScope] = useScopeParam();
	return (
		<div
			className="inline-flex shrink-0 rounded-lg border border-border p-0.5 text-sm"
			role="group"
			aria-label="Search scope"
		>
			{OPTIONS.map((o) => (
				<button
					key={o.value}
					type="button"
					aria-pressed={scope === o.value}
					onClick={() => setScope(o.value)}
					className={cn(
						"rounded-md px-3 py-1 transition-colors",
						scope === o.value
							? "bg-primary text-primary-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. --write src/components/search-bar/scope-toggle.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/search-bar/scope-toggle.tsx
git commit -m "feat(search): this-set/all-sets scope toggle"
```

---

### Task 8: Reassemble `SearchBar`

**Files:** Modify `src/components/search-bar/search-bar.tsx`

- [ ] **Step 1: Replace the file** — compose SearchInput + FilterMenu (right of input) + ScopeToggle (only when a set is selected).

```tsx
import { useSetIdParam } from "../../hooks/use-url-selection";
import { FilterMenu } from "./filter-menu";
import { ScopeToggle } from "./scope-toggle";
import { SearchInput } from "./search-input";

export function SearchBar() {
	const [setId] = useSetIdParam();
	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<SearchInput className="flex-1" />
				<FilterMenu />
			</div>
			{setId && (
				<div className="flex justify-end">
					<ScopeToggle />
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. --write src/components/search-bar/search-bar.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/search-bar/search-bar.tsx
git commit -m "refactor(search): compose SearchBar from input + filter menu + scope toggle"
```

---

### Task 9: Home page

**Files:** Create `src/pages/home.tsx`

- [ ] **Step 1: Implement** — search-first landing with recent searches + recently viewed.

```tsx
import { useNavigate } from "react-router";
import { HoloCard } from "../components/holo-card";
import { SearchInput } from "../components/search-bar/search-input";
import { useNameQueryParam } from "../hooks/use-url-selection";
import { useStore } from "../store";
import { useRecentsStore } from "../store/recents";

export function Home() {
	const navigate = useNavigate();
	const [, setQuery] = useNameQueryParam();
	const recentSearches = useRecentsStore((s) => s.recentSearches);
	const recentlyViewed = useRecentsStore((s) => s.recentlyViewed);
	const clearRecentSearches = useRecentsStore((s) => s.clearRecentSearches);
	const owned = useStore((s) => s.owned);

	const empty = recentSearches.length === 0 && recentlyViewed.length === 0;

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-4 py-16">
			<img
				src={`${import.meta.env.BASE_URL}logo-64.png`}
				alt=""
				className="size-20"
			/>
			<h1 className="text-center text-2xl font-bold">
				Pokémon TCG Holo Playground
			</h1>
			<SearchInput
				autoFocus
				placeholder="Search any card by name…"
				className="w-full"
			/>

			{recentSearches.length > 0 && (
				<section className="w-full">
					<div className="mb-2 flex items-center justify-between">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Recent searches
						</h2>
						<button
							type="button"
							onClick={clearRecentSearches}
							className="text-xs text-muted-foreground hover:text-foreground"
						>
							Clear
						</button>
					</div>
					<div className="flex flex-wrap gap-2">
						{recentSearches.map((q) => (
							<button
								key={q}
								type="button"
								onClick={() => setQuery(q)}
								className="rounded-full bg-secondary px-3 py-1 text-sm text-foreground hover:bg-secondary/80"
							>
								{q}
							</button>
						))}
					</div>
				</section>
			)}

			{recentlyViewed.length > 0 && (
				<section className="w-full">
					<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Recently viewed
					</h2>
					<div className="flex flex-wrap gap-3">
						{recentlyViewed.map((card) => (
							<HoloCard
								key={card.id}
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
								onClick={(e) => {
									if (e.defaultPrevented) return;
									navigate(`/card/${card.id}`);
								}}
								style={{ width: 150 }}
							/>
						))}
					</div>
				</section>
			)}

			{empty && (
				<p className="text-center text-sm text-muted-foreground">
					Search a card above, or pick a set from the sidebar.
				</p>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. --write src/pages/home.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/home.tsx
git commit -m "feat(home): search-first landing with recent searches + recently viewed"
```

---

### Task 10: BrowsePage — Home branch + scope-aware fetch + content header

**Files:** Modify `src/pages/browse-page.tsx`

- [ ] **Step 1: Replace the file** — render `Home` when no set + no query; remove the auto-newest-select; make the fetcher/cacheKey scope-aware; show a set-identity content header.

```tsx
import { useMemo } from "react";
import { Outlet } from "react-router";
import { getCardsByName, getCardsBySet } from "../api";
import { CardGrid } from "../components/card-grid";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import type { HoloCardData } from "../components/holo-card";
import { PokemonTimeline } from "../components/pokemon-timeline";
import { SearchBar } from "../components/search-bar/search-bar";
import { ViewModeToggle } from "../components/view-mode-toggle";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { usePokemonList } from "../hooks/use-pokemon-list";
import { useSets } from "../hooks/use-sets";
import {
	useFilterParam,
	useNameQueryParam,
	useScopeParam,
	useSetIdParam,
	useViewModeParam,
} from "../hooks/use-url-selection";
import { pokemonNameByDex } from "../utils/pokemon-name";
import { Home } from "./home";

export function BrowsePage() {
	const sets = useSets();
	const pokemonList = usePokemonList();
	const [selectedSetId] = useSetIdParam();
	const [query] = useNameQueryParam();
	const [scope] = useScopeParam();
	const [view, setView] = useViewModeParam();
	const [types] = useFilterParam("types");
	const [rarity] = useFilterParam("rarity");
	const [supertype] = useFilterParam("supertype");
	const [subtypes] = useFilterParam("subtypes");

	const searching = query !== "";
	const showHome = !selectedSetId && !searching;
	// Set-scoped when a set is selected, scope=set, and a query is present.
	const setScoped = searching && !!selectedSetId && scope === "set";

	const filterSig = `${types.join(",")}|${rarity.join(",")}|${supertype.join(",")}|${subtypes.join(",")}`;
	const baseKey = searching
		? setScoped
			? `set:${selectedSetId}|q:${encodeURIComponent(query)}`
			: `q:${encodeURIComponent(query)}`
		: selectedSetId
			? selectedSetId
			: null;
	const cacheKey = baseKey
		? filterSig === "|||"
			? baseKey
			: `${baseKey}|${filterSig}`
		: null;

	const fetcher: CardFetcher = useMemo(
		() => (_key, page, pageSize) => {
			const filters = { types, rarity, supertype, subtypes };
			if (searching) {
				if (setScoped && selectedSetId) {
					return getCardsBySet(selectedSetId, page, pageSize, filters, query);
				}
				return getCardsByName(query, page, pageSize, filters);
			}
			if (selectedSetId) {
				return getCardsBySet(selectedSetId, page, pageSize, filters);
			}
			return Promise.resolve({ cards: [], totalCount: 0 });
		},
		[searching, setScoped, selectedSetId, query, types, rarity, supertype, subtypes],
	);

	const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);
	const currentSet = sets.find((s) => s.id === selectedSetId);

	function renderOverlay(card: HoloCardData) {
		const links = (card.nationalPokedexNumbers ?? []).flatMap((n) => {
			const name = pokemonNameByDex(pokemonList, n);
			return name
				? [{ label: `View all ${name}`, to: `/?q=${encodeURIComponent(name)}` }]
				: [];
		});
		// In a set view, also offer a jump to the set page for searched results.
		if (searching && card.setId !== selectedSetId) {
			links.push({ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` });
		}
		return (
			<>
				<CrossLinkOverlay links={links} />
				<CollectionToggle card={card} />
			</>
		);
	}

	if (showHome) {
		return (
			<div className="h-full overflow-y-auto">
				<Home />
				<Outlet />
			</div>
		);
	}

	return (
		<div className="mx-auto flex h-full w-full min-h-0 max-w-7xl flex-col px-4">
			<div className="shrink-0 space-y-3 py-5">
				<SearchBar />
				<div className="flex items-center justify-between gap-3">
					{!searching && currentSet ? (
						<div className="flex min-w-0 items-center gap-3">
							<img
								src={currentSet.images.logo}
								alt=""
								className="h-8 object-contain"
							/>
							<div className="min-w-0">
								<div className="truncate font-semibold">{currentSet.name}</div>
								<div className="truncate text-xs text-muted-foreground">
									{currentSet.series} · {currentSet.total} cards · {cards.length}{" "}
									loaded
								</div>
							</div>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							Results for "{query}"
							{setScoped && currentSet ? ` in ${currentSet.name}` : ""} ·{" "}
							{cards.length} loaded
						</p>
					)}
					{searching && (
						<ViewModeToggle value={view} onChange={setView} disabled={false} />
					)}
				</div>
			</div>
			{view === "timeline" && searching ? (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<PokemonTimeline
						cards={cards}
						loading={loading}
						hasMore={hasMore}
						onLoadMore={() => cacheKey && loadMore(cacheKey)}
						renderOverlay={renderOverlay}
					/>
				</div>
			) : (
				<CardGrid
					setId={cacheKey}
					cards={cards}
					onEndReached={loadMore}
					renderOverlay={renderOverlay}
				/>
			)}
			{loading && (
				<div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-card px-4 py-2 text-sm shadow-lg">
					Loading…
				</div>
			)}
			<Outlet />
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. --write src/pages/browse-page.tsx`
Expected: PASS.

- [ ] **Step 3: Update the browse-page test** — `src/pages/browse-page.test.tsx` likely asserts a set is auto-shown. Update it: (a) at `/` with empty store → Home renders (assert the "Search a card above…" hint or the logo/heading); (b) at `/?setId=base1` with a seeded set → the set content header + grid render. Run:

Run: `bun test src/pages/browse-page.test.tsx`
Expected: PASS (adjust assertions to the new behavior; note any dropped).

- [ ] **Step 4: Commit**

```bash
git add src/pages/browse-page.tsx src/pages/browse-page.test.tsx
git commit -m "feat(browse): Home landing + scope-aware fetch + set content header"
```

---

### Task 11: Record recently viewed in the card dialog

**Files:** Modify `src/components/card-dialog/card-dialog.tsx`

- [ ] **Step 1: Add the capture** — import the store + `useEffect`, and after the existing `toHoloCardData` helper is available, record on mount/card change:

```tsx
// add to imports
import { useEffect } from "react";
import { useRecentsStore } from "../../store/recents";

// inside CardDialog(), after `card` is read from the loader:
const addRecentlyViewed = useRecentsStore((s) => s.addRecentlyViewed);
useEffect(() => {
	addRecentlyViewed(toHoloCardData(card));
}, [card, addRecentlyViewed]);
```

(`toHoloCardData(card)` already exists in this file. `card.id` is stable per loaded card; depending on `card` is fine — the loader returns a new object only on id change.)

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. --write src/components/card-dialog/card-dialog.tsx`
Expected: PASS.

- [ ] **Step 3: Verify the dialog test still passes**

Run: `bun test src/components/card-dialog/card-dialog.test.tsx`
Expected: PASS (the store call is a no-op side effect in tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/card-dialog/card-dialog.tsx
git commit -m "feat(card): record recently viewed on dialog open"
```

---

### Task 12: Remove the set block from the toolbar

**Files:** Modify `src/components/app-shell/toolbar.tsx`

- [ ] **Step 1: Edit** — remove the `currentSet` lookup + its JSX block; drop the now-unused `useSets` import. Keep `useSetIdParam` (Open Packs still needs `selectedSetId`).
  - Delete the line `const currentSet = sets.find((s) => s.id === selectedSetId);` and `const sets = useSets();` and the `import { useSets } ...` line.
  - Delete the whole `{currentSet && ( … )}` block (the set logo/name/count div).

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. --write src/components/app-shell/toolbar.tsx`
Expected: PASS (no unused-var errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/app-shell/toolbar.tsx
git commit -m "refactor(toolbar): drop set name (now in content header)"
```

---

### Task 13: Show release year in the sidebar

**Files:** Modify `src/components/series-sidebar/series-sidebar-item.tsx`, `src/components/series-sidebar/series-sidebar.tsx`

- [ ] **Step 1: Pass `year` through the container** — in `series-sidebar.tsx`, the mapped group now has `year`; pass it:

```tsx
{groups.map(({ series, sets: seriesSets, year }) => (
	<SeriesSidebarItem
		key={series}
		series={series}
		year={year}
		sets={seriesSets}
		open={openSeries === series}
		onOpenChange={(open) => setOpenSeries(open ? series : null)}
		selectedSetId={selectedSetId}
		onSelect={(id) => {
			setSelectedSetId(id);
			onAfterSelect?.();
		}}
	/>
))}
```

- [ ] **Step 2: Render the year in the item** — add `year: number` to `SeriesSidebarItemProps` and show it between the series name and the count in the `CollapsibleTrigger`:

```tsx
<span className="flex-1 truncate">{series}</span>
<span className="text-xs tabular-nums text-muted-foreground">{year}</span>
<span className="text-xs text-muted-foreground">{sets.length}</span>
```

- [ ] **Step 3: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. --write src/components/series-sidebar/series-sidebar.tsx src/components/series-sidebar/series-sidebar-item.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/series-sidebar/series-sidebar.tsx src/components/series-sidebar/series-sidebar-item.tsx
git commit -m "feat(sidebar): show series release year"
```

---

### Task 14: Remove orphans + full verification

**Files:** Delete `src/components/search-bar/filter-popover.tsx` (+ test), `src/utils/pick-newest-set.ts` (+ test)

- [ ] **Step 1: Confirm orphaned, then remove**

```bash
grep -rn "filter-popover\|FilterPopover" src || echo "filter-popover orphaned"
grep -rn "pick-newest-set\|pickNewestSetId" src || echo "pick-newest-set orphaned"
```
For each that prints "orphaned": `git rm` it (and its `.test.ts(x)` if present). If a grep shows a real remaining reference, fix it instead.

- [ ] **Step 2: Full suite — lint, typecheck, tests**

Run:
```bash
bun run typecheck
bunx biome check --config-path=. src
bun test
```
Expected: all PASS. Fix any failure.

- [ ] **Step 3: Build + preview smoke test**

Run: `bun run build && bun run preview`. In the browser preview (unregister the SW first if assets look stale), verify:
- `/` → Home: logo + search; empty-state hint on a fresh profile.
- Type a query on Home → transitions to global results.
- Pick a set in the sidebar → set view with the content header (logo + name + count); toolbar has NO set name.
- In a set, type a query → set-scoped results; toggle `All sets` → global; toggle back → set-scoped.
- Filter button opens the menu; selecting options shows the badge; results narrow; "Clear all filters" resets.
- Sidebar series rows show the release year.
- Open a card → close → it appears under "Recently viewed" on Home; the query appears under "Recent searches".

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove orphaned filter-popover + pick-newest-set"
```

> Use explicit paths if `git status` shows anything unrelated/untracked (do NOT sweep stray files).

---

## Self-Review

**Spec coverage:**
- Recents store (localStorage) → Task 1. ✓
- Search-first Home + recents → Tasks 5, 9, 10. ✓
- Search scope (set default + all toggle) → Tasks 2, 4, 7, 8, 10. ✓
- Filter menu behind a button → Task 6, 8. ✓
- Toolbar set-name removal + content header → Tasks 10, 12. ✓
- Sidebar release year → Tasks 3, 13. ✓
- Recently-viewed capture → Task 11; recent-search capture → Task 5. ✓
- Remove auto-newest-select + orphans → Tasks 10, 14. ✓

**Placeholder scan:** No TBD/TODO. Task 2's test references the file's existing render-hook helper (named `renderHookAt` as a stand-in) with an explicit instruction to match the real one — the only deliberately-parameterized bit, called out. Task 10/Task 3 tests say "adjust assertions" but name exactly what to assert.

**Type consistency:** `useRecentsStore` API (`recentSearches`, `recentlyViewed`, `addRecentSearch`, `addRecentlyViewed`, `clearRecentSearches`) consistent across Tasks 1, 5, 9, 11. `useScopeParam(): [SearchScope, setter]` consistent in Tasks 2, 7, 10. `SeriesGroup.year` consistent in Tasks 3, 13. `getCardsBySet(setId, page, pageSize, filters?, name?)` consistent in Tasks 4, 10. `SearchInput`/`FilterMenu`/`ScopeToggle` props match their consumers (SearchBar Task 8, Home Task 9).

**Risk:** `autoFocus` on Home's SearchInput needs the biome ignore comment (included). The browse-page test rewrite (Task 10 Step 3) depends on the existing test's store-seeding helper — read it before editing.

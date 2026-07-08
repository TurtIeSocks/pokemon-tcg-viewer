# `/pokemon` Pokédex Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing `/pokemon` index route — a national-dex directory of every Pokémon species that has at least one card in the corpus, each a pixel-sprite tile linking to `/pokemon/$name`.

**Architecture:** A pure aggregator (`buildPokedex`) reduces the server corpus into one light row per species. A thin `getPokedexFn` server fn wires `queryCorpusServer` + the cached species list into it. The route SSRs the rows; a client-only search box + generation jump-bar drive a single virtualized grid of `SpeciesTile`s. No new data source — sprites come from a predictable PokéAPI URL by dex number; the type-glow color reuses the existing `getCardAccent`.

**Tech Stack:** TanStack Start (createServerFn + file routes), React 19, `react-virtuoso` (`VirtuosoGrid`), Bun test + happy-dom + `@testing-library/react`, Tailwind v4 (Liquid Glass tokens).

## Global Constraints

- Tests use `bun:test` + happy-dom; **never hit the network**. Pure logic tested with hand-built arrays; component tests mount under a stub router (mirror `src/routes/index.test.tsx`).
- **No em-dashes in user-facing copy** (meta text, UI labels). Use periods/commas.
- **Reuse `getCardAccent(types)`** from `src/utils/card-colors.ts` for the type glow. Do NOT add a new type-color map.
- Optional fields are **`null`, never `undefined`** (`PokedexRow.type` is `string | null`).
- Style with Liquid Glass tokens (`--ink`, `--primary`, `bg-white/5`, inset highlight). Guard all motion with `motion-reduce:`.
- Display species names with `titleCaseSlug` from `src/lib/slug.ts` (PokéAPI names are lowercase-hyphenated).
- Lint in the worktree with `bunx biome check --config-path=. --write <files>` (nested-config gotcha). Typecheck with `bunx tsc -b`.
- Manual `useMemo`/`useState` are intentional (React Compiler on); keep them.

---

### Task 1: Pokédex lib (types, sprite URL, generations, filter)

**Files:**
- Create: `src/lib/pokedex.ts`
- Test: `src/lib/pokedex.test.ts`

**Interfaces:**
- Consumes: nothing (foundation, no app imports).
- Produces:
  - `interface PokedexRow { dex: number; name: string; count: number; type: string | null }`
  - `spriteUrl(dex: number): string`
  - `interface Generation { label: string; start: number; end: number }`
  - `const GENERATIONS: Generation[]`
  - `generationOf(dex: number): string | null`
  - `filterPokedex(rows: PokedexRow[], query: string): PokedexRow[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pokedex.test.ts
import { describe, expect, test } from "bun:test";
import {
	filterPokedex,
	GENERATIONS,
	generationOf,
	type PokedexRow,
	spriteUrl,
} from "./pokedex";

describe("spriteUrl", () => {
	test("builds the PokéAPI national-dex sprite URL for a dex number", () => {
		expect(spriteUrl(6)).toBe(
			"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png",
		);
	});
});

describe("GENERATIONS / generationOf", () => {
	test("covers dex 1 through 1025 with no gaps or overlaps", () => {
		expect(GENERATIONS[0].start).toBe(1);
		expect(GENERATIONS.at(-1)?.end).toBe(1025);
		for (let i = 1; i < GENERATIONS.length; i++) {
			expect(GENERATIONS[i].start).toBe(GENERATIONS[i - 1].end + 1);
		}
	});
	test("maps a dex number to its generation label", () => {
		expect(generationOf(6)).toBe("Gen 1");
		expect(generationOf(152)).toBe("Gen 2");
		expect(generationOf(906)).toBe("Gen 9");
	});
	test("returns null out of range", () => {
		expect(generationOf(9999)).toBeNull();
	});
});

describe("filterPokedex", () => {
	const rows: PokedexRow[] = [
		{ dex: 6, name: "charizard", count: 9, type: "Fire" },
		{ dex: 25, name: "pikachu", count: 9, type: "Lightning" },
	];
	test("empty query returns all rows", () => {
		expect(filterPokedex(rows, "")).toHaveLength(2);
	});
	test("matches by name substring, case-insensitive", () => {
		expect(filterPokedex(rows, "Char")).toEqual([rows[0]]);
	});
	test("matches by dex number", () => {
		expect(filterPokedex(rows, "25")).toEqual([rows[1]]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/pokedex.test.ts`
Expected: FAIL (cannot find module `./pokedex`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/pokedex.ts

/** One directory row per species that has at least one card in the corpus. */
export interface PokedexRow {
	dex: number;
	name: string;
	count: number;
	/** Most-frequent first energy type across this species' cards, or null. */
	type: string | null;
}

const SPRITE_BASE =
	"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

/** PokéAPI national-dex pixel sprite for a species. */
export function spriteUrl(dex: number): string {
	return `${SPRITE_BASE}/${dex}.png`;
}

export interface Generation {
	label: string;
	start: number;
	end: number;
}

/** National-dex ranges per game generation (inclusive). */
export const GENERATIONS: Generation[] = [
	{ label: "Gen 1", start: 1, end: 151 },
	{ label: "Gen 2", start: 152, end: 251 },
	{ label: "Gen 3", start: 252, end: 386 },
	{ label: "Gen 4", start: 387, end: 493 },
	{ label: "Gen 5", start: 494, end: 649 },
	{ label: "Gen 6", start: 650, end: 721 },
	{ label: "Gen 7", start: 722, end: 809 },
	{ label: "Gen 8", start: 810, end: 905 },
	{ label: "Gen 9", start: 906, end: 1025 },
];

/** Generation label containing a dex number, or null when out of range. */
export function generationOf(dex: number): string | null {
	const g = GENERATIONS.find((g) => dex >= g.start && dex <= g.end);
	return g ? g.label : null;
}

/** Filter rows by a query matching the species name (substring) or dex number. */
export function filterPokedex(rows: PokedexRow[], query: string): PokedexRow[] {
	const q = query.trim().toLowerCase();
	if (!q) return rows;
	return rows.filter(
		(r) => r.name.toLowerCase().includes(q) || String(r.dex).includes(q),
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/pokedex.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pokedex.ts src/lib/pokedex.test.ts
git commit -m "feat(pokedex): species-directory types + sprite/generation/filter helpers"
```

---

### Task 2: `buildPokedex` corpus aggregation

**Files:**
- Modify: `src/server/pokemon-dex.ts` (export `dexFromUrl`; add `buildPokedex`)
- Test: `src/server/pokemon-dex.test.ts` (append)

**Interfaces:**
- Consumes: `PokedexRow` from `src/lib/pokedex` (Task 1); `HoloCardData` from `src/components/holo-card`; `PokemonListEntry` from `./card-mappers`.
- Produces: `buildPokedex(cards: HoloCardData[], list: PokemonListEntry[]): PokedexRow[]` and exported `dexFromUrl(url: string): number | null`.

- [ ] **Step 1: Write the failing test (append to existing file)**

```ts
// add to src/server/pokemon-dex.test.ts
import type { HoloCardData } from "../components/holo-card";
import { buildPokedex } from "./pokemon-dex";

function card(
	id: string,
	dex: number[] | undefined,
	types?: string[],
): HoloCardData {
	return {
		id,
		name: id,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId: "x",
		setName: "X",
		setSeries: "",
		cardNumber: "1",
		nationalPokedexNumbers: dex,
		types,
	};
}

describe("buildPokedex", () => {
	const list: PokemonListEntry[] = [
		{ name: "bulbasaur", url: "https://pokeapi.co/api/v2/pokemon/1/" },
		{ name: "charizard", url: "https://pokeapi.co/api/v2/pokemon/6/" },
		{ name: "mew", url: "https://pokeapi.co/api/v2/pokemon/151/" },
	];

	test("emits one row per species with >=1 card, counts cards, sorts by dex", () => {
		const rows = buildPokedex(
			[
				card("c1", [6], ["Fire"]),
				card("c2", [6], ["Fire"]),
				card("c3", [1], ["Grass"]),
			],
			list,
		);
		expect(rows.map((r) => r.dex)).toEqual([1, 6]); // mew (151) excluded, sorted
		expect(rows.find((r) => r.dex === 6)?.count).toBe(2);
		expect(rows.find((r) => r.dex === 6)?.type).toBe("Fire");
	});

	test("type is the most-frequent first type; null when no types", () => {
		const rows = buildPokedex(
			[
				card("a", [6], ["Fire"]),
				card("b", [6], ["Dragon"]),
				card("c", [6], ["Fire"]),
				card("d", [1], undefined),
			],
			list,
		);
		expect(rows.find((r) => r.dex === 6)?.type).toBe("Fire");
		expect(rows.find((r) => r.dex === 1)?.type).toBeNull();
	});

	test("a multi-dex card counts toward every species it lists", () => {
		const rows = buildPokedex([card("m", [1, 6], ["Grass"])], list);
		expect(rows.find((r) => r.dex === 1)?.count).toBe(1);
		expect(rows.find((r) => r.dex === 6)?.count).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/pokemon-dex.test.ts`
Expected: FAIL (`buildPokedex` is not exported).

- [ ] **Step 3: Write minimal implementation**

In `src/server/pokemon-dex.ts`: add imports at top, export the existing `dexFromUrl`, and append `buildPokedex`.

```ts
// top of file — add these imports
import type { HoloCardData } from "../components/holo-card";
import type { PokedexRow } from "../lib/pokedex";

// change the existing private helper signature to export it:
/** Extract the trailing numeric id from a PokéAPI URL (".../6/"). */
export function dexFromUrl(url: string): number | null {
	const m = url.match(/\/(\d+)\/?$/);
	return m ? Number(m[1]) : null;
}

// append at end of file:

/** Most-frequent key in a count map, or null if empty. Ties resolve to first seen. */
function topKey(counts: Map<string, number>): string | null {
	let best: string | null = null;
	let bestN = 0;
	for (const [k, n] of counts) {
		if (n > bestN) {
			best = k;
			bestN = n;
		}
	}
	return best;
}

/**
 * Aggregate the corpus into one directory row per species that has at least one
 * card. `count` = cards referencing that national-dex number; `type` = the
 * most-frequent first energy type across those cards. Sorted ascending by dex.
 */
export function buildPokedex(
	cards: HoloCardData[],
	list: PokemonListEntry[],
): PokedexRow[] {
	const agg = new Map<number, { count: number; types: Map<string, number> }>();
	for (const c of cards) {
		for (const dex of c.nationalPokedexNumbers ?? []) {
			let a = agg.get(dex);
			if (!a) {
				a = { count: 0, types: new Map() };
				agg.set(dex, a);
			}
			a.count++;
			const t = c.types?.[0];
			if (t) a.types.set(t, (a.types.get(t) ?? 0) + 1);
		}
	}
	const rows: PokedexRow[] = [];
	for (const entry of list) {
		const dex = dexFromUrl(entry.url);
		if (dex == null) continue;
		const a = agg.get(dex);
		if (!a) continue;
		rows.push({ dex, name: entry.name, count: a.count, type: topKey(a.types) });
	}
	rows.sort((x, y) => x.dex - y.dex);
	return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/server/pokemon-dex.test.ts`
Expected: PASS (existing `dexByName`/`nameByDex` tests + new `buildPokedex` cases).

- [ ] **Step 5: Commit**

```bash
git add src/server/pokemon-dex.ts src/server/pokemon-dex.test.ts
git commit -m "feat(pokedex): buildPokedex corpus aggregator"
```

---

### Task 3: `SpeciesTile` component

**Files:**
- Create: `src/components/pokedex/species-tile.tsx`
- Test: `src/components/pokedex/species-tile.test.tsx`

**Interfaces:**
- Consumes: `PokedexRow` + `spriteUrl` (Task 1); `getCardAccent` from `src/utils/card-colors`; `titleCaseSlug` from `src/lib/slug`; `LIST_SEARCH_DEFAULTS` from `src/lib/list-search`.
- Produces: `SpeciesTile({ row }: { row: PokedexRow })` — a `<Link to="/pokemon/$name">` tile.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/pokedex/species-tile.test.tsx
import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { spriteUrl } from "../../lib/pokedex";
import { SpeciesTile } from "./species-tile";

async function mount(ui: ReactNode) {
	const root = createRootRoute({ component: () => ui });
	const name = createRoute({
		getParentRoute: () => root,
		path: "/pokemon/$name",
		component: () => null,
	});
	const router = createRouter({ routeTree: root.addChildren([name]) });
	await router.load();
	render(<RouterProvider router={router} />);
}

test("renders the species sprite, name, dex and card count", async () => {
	await mount(
		<SpeciesTile row={{ dex: 6, name: "charizard", count: 248, type: "Fire" }} />,
	);
	const img = screen.getByRole("img", { name: "charizard" }) as HTMLImageElement;
	expect(img.src).toBe(spriteUrl(6));
	expect(screen.getByText("Charizard")).toBeDefined();
	expect(screen.getByText("#006")).toBeDefined();
	expect(screen.getByText(/248 cards/)).toBeDefined();
});

test("falls back to a placeholder when the sprite fails to load", async () => {
	await mount(
		<SpeciesTile row={{ dex: 9999, name: "missingno", count: 1, type: null }} />,
	);
	const img = screen.getByRole("img", { name: "missingno" }) as HTMLImageElement;
	fireEvent.error(img);
	expect(img.getAttribute("src")).not.toBe(spriteUrl(9999));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/pokedex/species-tile.test.tsx`
Expected: FAIL (cannot find module `./species-tile`).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/pokedex/species-tile.tsx
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { getCardAccent } from "@/utils/card-colors";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import { type PokedexRow, spriteUrl } from "../../lib/pokedex";
import { titleCaseSlug } from "../../lib/slug";

// Faint inline silhouette shown when a dex has no PokéAPI sprite (gaps/forms).
const FALLBACK_SPRITE =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='22' fill='%23ffffff' opacity='0.12'/%3E%3C/svg%3E";

/** One species in the Pokédex directory: pixel sprite + name + dex # + card count. */
export function SpeciesTile({ row }: { row: PokedexRow }) {
	const [src, setSrc] = useState(spriteUrl(row.dex));
	const glow = getCardAccent(row.type ? [row.type] : undefined);
	return (
		<Link
			to="/pokemon/$name"
			params={{ name: row.name }}
			search={LIST_SEARCH_DEFAULTS}
			className="group block rounded-2xl border border-white/10 bg-white/5 p-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) motion-reduce:transition-none"
		>
			<div className="relative flex h-24 items-center justify-center">
				<span
					aria-hidden="true"
					className="absolute h-20 w-20 rounded-full opacity-50 blur-2xl"
					style={{ background: glow }}
				/>
				<img
					src={src}
					alt={row.name}
					loading="lazy"
					onError={() =>
						setSrc((s) => (s === FALLBACK_SPRITE ? s : FALLBACK_SPRITE))
					}
					className="relative z-10 h-20 w-20 [image-rendering:pixelated]"
				/>
			</div>
			<div className="truncate font-sans text-sm font-semibold text-(--ink)">
				{titleCaseSlug(row.name)}
			</div>
			<div className="mt-0.5 font-mono text-[11px] text-(--ink-muted) tabular-nums">
				#{String(row.dex).padStart(3, "0")}
			</div>
			<div className="mt-1.5 inline-block rounded-full border border-(--primary)/25 bg-(--primary)/10 px-2 font-mono text-[10px] text-(--primary) tabular-nums">
				{row.count} {row.count === 1 ? "card" : "cards"}
			</div>
		</Link>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/pokedex/species-tile.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/pokedex/species-tile.tsx src/components/pokedex/species-tile.test.tsx
git commit -m "feat(pokedex): SpeciesTile sprite tile"
```

---

### Task 4: `PokedexGrid` (virtualized, with happy-dom fallback)

**Files:**
- Create: `src/components/pokedex/pokedex-grid.tsx`
- Test: `src/components/pokedex/pokedex-grid.test.tsx`

**Interfaces:**
- Consumes: `PokedexRow` (Task 1); `SpeciesTile` (Task 3); `VirtuosoGrid` + `VirtuosoGridHandle` from `react-virtuoso`.
- Produces: `PokedexGrid` — `forwardRef<VirtuosoGridHandle, { rows: PokedexRow[] }>`. Renders an empty state for `rows.length === 0`; a plain grid in test/no-measure env; `VirtuosoGrid` otherwise.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/pokedex/pokedex-grid.test.tsx
import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PokedexRow } from "../../lib/pokedex";
import { PokedexGrid } from "./pokedex-grid";

async function mount(ui: ReactNode) {
	const root = createRootRoute({ component: () => ui });
	const name = createRoute({
		getParentRoute: () => root,
		path: "/pokemon/$name",
		component: () => null,
	});
	const router = createRouter({ routeTree: root.addChildren([name]) });
	await router.load();
	render(<RouterProvider router={router} />);
}

const rows: PokedexRow[] = [
	{ dex: 1, name: "bulbasaur", count: 5, type: "Grass" },
	{ dex: 6, name: "charizard", count: 9, type: "Fire" },
];

test("renders a tile per row", async () => {
	await mount(<PokedexGrid rows={rows} />);
	expect(screen.getAllByRole("img")).toHaveLength(2);
});

test("shows an empty state when there are no rows", async () => {
	await mount(<PokedexGrid rows={[]} />);
	expect(screen.getByText(/no species match/i)).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/pokedex/pokedex-grid.test.tsx`
Expected: FAIL (cannot find module `./pokedex-grid`).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/pokedex/pokedex-grid.tsx
import { forwardRef } from "react";
import { VirtuosoGrid, type VirtuosoGridHandle } from "react-virtuoso";
import type { PokedexRow } from "../../lib/pokedex";
import { SpeciesTile } from "./species-tile";

const GRID_CLASS =
	"grid grid-cols-3 gap-3 m-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6";

// Same detection as card-grid-island: happy-dom measures 0 height so Virtuoso
// paints nothing. Render a plain grid there so the directory is assertable and
// SSR-equivalent; production with a real layout uses the virtualized path.
const isTestEnv =
	(typeof window !== "undefined" && !("ResizeObserver" in window)) ||
	(typeof process !== "undefined" && process.env.NODE_ENV === "test");

/** Virtualized national-dex grid of species tiles. Ref forwards to VirtuosoGrid for jump-scroll. */
export const PokedexGrid = forwardRef<
	VirtuosoGridHandle,
	{ rows: PokedexRow[] }
>(function PokedexGrid({ rows }, ref) {
	if (rows.length === 0) {
		return (
			<p className="py-16 text-center font-sans text-sm text-(--ink-muted)">
				No species match.
			</p>
		);
	}
	if (isTestEnv) {
		return (
			<ul className={GRID_CLASS}>
				{rows.map((r) => (
					<li key={r.dex}>
						<SpeciesTile row={r} />
					</li>
				))}
			</ul>
		);
	}
	return (
		<VirtuosoGrid
			ref={ref}
			className="h-full"
			totalCount={rows.length}
			listClassName={GRID_CLASS}
			itemContent={(index) => {
				const r = rows[index];
				return r ? <SpeciesTile row={r} /> : null;
			}}
		/>
	);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/pokedex/pokedex-grid.test.tsx`
Expected: PASS (two tiles; empty state).

- [ ] **Step 5: Commit**

```bash
git add src/components/pokedex/pokedex-grid.tsx src/components/pokedex/pokedex-grid.test.tsx
git commit -m "feat(pokedex): virtualized PokedexGrid with test fallback"
```

---

### Task 5: `GenerationBar` jump pills

**Files:**
- Create: `src/components/pokedex/generation-bar.tsx`
- Test: `src/components/pokedex/generation-bar.test.tsx`

**Interfaces:**
- Consumes: `GENERATIONS` + `PokedexRow` (Task 1); `Button` from `@/components/ui/button`.
- Produces: `GenerationBar({ rows, onJump }: { rows: PokedexRow[]; onJump: (index: number) => void })`. Each pill is disabled when no visible row falls in its range; click calls `onJump` with the first matching row index.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/pokedex/generation-bar.test.tsx
import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PokedexRow } from "../../lib/pokedex";
import { GenerationBar } from "./generation-bar";

const rows: PokedexRow[] = [
	{ dex: 1, name: "bulbasaur", count: 5, type: "Grass" },
	{ dex: 152, name: "chikorita", count: 4, type: "Grass" },
	{ dex: 160, name: "feraligatr", count: 3, type: "Water" },
];

test("jumps to the first index of a populated generation", () => {
	const jumps: number[] = [];
	render(<GenerationBar rows={rows} onJump={(i) => jumps.push(i)} />);
	fireEvent.click(screen.getByRole("button", { name: "Gen 2" }));
	expect(jumps).toEqual([1]); // first row with dex in 152..251
});

test("disables a generation with no visible rows", () => {
	render(<GenerationBar rows={rows} onJump={() => {}} />);
	const gen3 = screen.getByRole("button", { name: "Gen 3" }) as HTMLButtonElement;
	expect(gen3.disabled).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/pokedex/generation-bar.test.tsx`
Expected: FAIL (cannot find module `./generation-bar`).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/pokedex/generation-bar.tsx
import { Button } from "@/components/ui/button";
import { GENERATIONS, type PokedexRow } from "../../lib/pokedex";

interface GenerationBarProps {
	rows: PokedexRow[];
	onJump: (index: number) => void;
}

/** Gen 1-9 jump pills; scrolls the grid to the first species of a generation. */
export function GenerationBar({ rows, onJump }: GenerationBarProps) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{GENERATIONS.map((g) => {
				const index = rows.findIndex(
					(r) => r.dex >= g.start && r.dex <= g.end,
				);
				return (
					<Button
						key={g.label}
						variant="soft"
						size="sm"
						disabled={index === -1}
						onClick={() => onJump(index)}
					>
						{g.label}
					</Button>
				);
			})}
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/pokedex/generation-bar.test.tsx`
Expected: PASS (jump index; disabled generation).

- [ ] **Step 5: Commit**

```bash
git add src/components/pokedex/generation-bar.tsx src/components/pokedex/generation-bar.test.tsx
git commit -m "feat(pokedex): GenerationBar jump pills"
```

---

### Task 6: `getPokedexFn` server fn + `/pokemon` route

**Files:**
- Modify: `src/server/corpus-server.ts` (add `getPokedexFn`; import `buildPokedex`)
- Create: `src/routes/pokemon/index.tsx`

**Interfaces:**
- Consumes: `buildPokedex` (Task 2); `queryCorpusServer` (`./corpus-loader`, dynamic); `getPokemonListCached` (`./card-data-fetch`, dynamic); `filterPokedex` (Task 1); `PokedexGrid` (Task 4); `GenerationBar` (Task 5); `VirtuosoGridHandle` from `react-virtuoso`.
- Produces: `getPokedexFn(): Promise<PokedexRow[]>`; the `/pokemon/` route + `PokedexPage` component.

> No unit test: the server fn needs the live corpus/species fetch (the no-network rule forbids it in tests) and the route is thin wiring over already-tested units. Verified via the preview workflow in Step 4. This matches the codebase: `getDexCardsFn` and the other corpus fns have no dedicated tests.

- [ ] **Step 1: Add `getPokedexFn` to `src/server/corpus-server.ts`**

Add `buildPokedex` to the existing `./pokemon-dex` import, then append the fn:

```ts
// update existing import:
import { buildPokedex, nameByDex } from "./pokemon-dex";

/**
 * National-dex directory: one light row per species that has at least one card.
 * Joins the cached species list with a single pass over the server corpus.
 * Highly cacheable (corpus is static) so let the edge serve repeats.
 */
export const getPokedexFn = createServerFn({ method: "GET" }).handler(
	async () => {
		setResponseHeader("Cache-Control", cacheControl("ssr"));
		const [{ queryCorpusServer }, { getPokemonListCached }] = await Promise.all([
			import("./corpus-loader"),
			import("./card-data-fetch"),
		]);
		const [cards, list] = await Promise.all([
			queryCorpusServer({ setId: null, relevance: false }),
			getPokemonListCached(),
		]);
		return buildPokedex(cards, list);
	},
);
```

- [ ] **Step 2: Create the route `src/routes/pokemon/index.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import type { VirtuosoGridHandle } from "react-virtuoso";
import { GenerationBar } from "../../components/pokedex/generation-bar";
import { PokedexGrid } from "../../components/pokedex/pokedex-grid";
import { filterPokedex } from "../../lib/pokedex";
import { getPokedexFn } from "../../server/corpus-server";

export const Route = createFileRoute("/pokemon/")({
	loader: () => getPokedexFn(),
	head: ({ loaderData }) => ({
		meta: [
			{ title: "Pokédex · every Pokémon TCG card by species" },
			{
				name: "description",
				content: `Browse ${loaderData?.length ?? ""} Pokémon species and jump to every TCG card of each.`,
			},
			{ property: "og:title", content: "Pokédex · Pokémon TCG by species" },
		],
	}),
	component: PokedexPage,
});

function PokedexPage() {
	const rows = Route.useLoaderData();
	const [query, setQuery] = useState("");
	const gridRef = useRef<VirtuosoGridHandle>(null);
	const filtered = useMemo(() => filterPokedex(rows, query), [rows, query]);

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 flex shrink-0 flex-col gap-3">
				<input
					type="search"
					aria-label="Search species by name or dex number"
					placeholder="Search species…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 font-sans text-sm text-(--ink) placeholder:text-(--faint) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)"
				/>
				<GenerationBar
					rows={filtered}
					onJump={(index) =>
						index >= 0 &&
						gridRef.current?.scrollToIndex({ index, align: "start" })
					}
				/>
			</div>
			<div className="min-h-0 flex-1">
				<PokedexGrid ref={gridRef} rows={filtered} />
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Typecheck + lint + run the full pokedex suite**

Run (parallel): `bunx tsc -b` · `bunx biome check --config-path=. --write src/server/corpus-server.ts src/routes/pokemon/index.tsx` · `bun test src/components/pokedex src/lib/pokedex.test.ts src/server/pokemon-dex.test.ts`
Expected: clean typecheck, no lint errors, all tests pass.

- [ ] **Step 4: Verify in the preview**

Boot the dev server (`bun run dev`, port 6201) so `routeTree.gen.ts` regenerates with the new route, then via the preview tools: navigate to `/pokemon`, confirm the grid of sprite tiles renders, the search box filters, a generation pill scroll-jumps, and a tile click lands on `/pokemon/$name`. Capture a screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/server/corpus-server.ts src/routes/pokemon/index.tsx
git commit -m "feat(pokemon): /pokemon Pokédex directory route + getPokedexFn"
```

---

### Task 7: Link `/pokemon` from the home browse shelf

**Files:**
- Modify: `src/components/home/home-browse.tsx` (the "Browse by card type" section, ~line 86)

**Interfaces:**
- Consumes: the `/pokemon` route (Task 6). `Link` + `Button` are already imported in the file.
- Produces: a leading "Pokémon" pill before Trainers + Energy.

- [ ] **Step 1: Add the pill**

Insert as the first child of the "Browse by card type" pill row (before the Trainers `Button`):

```tsx
<Button variant="soft" size="sm" asChild>
	<Link to="/pokemon">Pokémon</Link>
</Button>
```

(No `search` prop: the `/pokemon` index has no `validateSearch`, unlike `/trainer` and `/energy`.)

- [ ] **Step 2: Verify existing home tests still pass + typecheck**

Run (parallel): `bun test src/routes/index.test.tsx` · `bunx tsc -b` · `bunx biome check --config-path=. --write src/components/home/home-browse.tsx`
Expected: PASS, clean typecheck, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/home-browse.tsx
git commit -m "feat(home): link /pokemon Pokédex from browse-by-type shelf"
```

---

## Self-Review

**Spec coverage:**
- Pokédex directory of species-with-cards → Task 2 (`buildPokedex` filters to `count >= 1`) + Task 6 (route).
- Pixel sprite + name + dex # + count + type glow → Task 3 (`SpeciesTile`), Task 1 (`spriteUrl`), `getCardAccent` reuse.
- Single virtual grid + search + generation jump-bar → Task 4 (`PokedexGrid`), Task 6 (search), Task 5 (`GenerationBar`).
- Pure catalog v1 (no Vault) → no userland imports anywhere.
- Tile → `/pokemon/$name` → Task 3 Link.
- Home wire-in + meta head → Task 7, Task 6 `head`.
- Edge cases: empty corpus (`rows: []` → grid empty state, Task 4), sprite 404 (fallback, Task 3), no-match search (empty state, Task 4), multi-dex card (Task 2 test), zero-card species excluded (Task 2 test).

**Placeholder scan:** none. Every code step is complete; the one untested unit (Task 6 server fn + route) is justified inline per the no-network rule and existing-codebase convention.

**Type consistency:** `PokedexRow { dex, name, count, type }` defined Task 1, consumed unchanged in Tasks 2-6. `buildPokedex(cards, list)` signature matches its call in Task 6. `PokedexGrid` is `forwardRef<VirtuosoGridHandle, { rows }>`, and Task 6 passes `ref={gridRef}` (`useRef<VirtuosoGridHandle>`) + `rows={filtered}`. `GenerationBar` props `{ rows, onJump }` match Task 6's usage. `spriteUrl`/`generationOf`/`filterPokedex`/`GENERATIONS` names consistent across Tasks 1, 3, 4, 5, 6.

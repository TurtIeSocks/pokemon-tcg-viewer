# Phase 4b — Pack Opening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Spec:** [docs/superpowers/specs/2026-05-03-phase-4b-pack-opening-design.md](../specs/2026-05-03-phase-4b-pack-opening-design.md)

**Goal:** New `/pack/:setId` route that fetches the full set, rolls 10 rarity-weighted random cards on user "rip", renders them with full holo shine + existing `<CollectionToggle>` overlay. "Rip pack" CTA on `/` header.

**Architecture:** New `pack-cards-slice` (mirrors `api-cache-slice`) caches set card lists. Pure `rollPack()` helper with injectable RNG. `<BoosterPack>` closed-pack visual. `<PackPage>` orchestrates state. Storage migration v3→v4 additive.

**Tech Stack:** React 19, React Router 7 (data router), Zustand 5 + persist, TypeScript, Vite 8, Bun, Biome, happy-dom + @testing-library/react.

---

## File map

**Create:**
- `src/store/pack-cards-slice.ts`
- `src/store/pack-cards-slice.test.ts`
- `src/utils/roll-pack.ts`
- `src/utils/roll-pack.test.ts`
- `src/components/booster-pack/index.ts`
- `src/components/booster-pack/booster-pack.tsx`
- `src/components/booster-pack/booster-pack.test.tsx`
- `src/components/booster-pack/booster-pack.css`
- `src/pages/pack-page.tsx`
- `src/pages/pack-page.test.tsx`
- `src/pages/pack-page.css`

**Modify:**
- `src/store/freshness.ts` — add `packCards` kind
- `src/store/index.ts` — compose new slice; bump `STORAGE_VERSION` 3→4 with additive migration
- `src/main.tsx` — register `/pack/:setId` route
- `src/components/header.tsx` — optional "Rip pack" link when `currentSet` set
- `src/components/header.css` — link styles

---

## Task 1: `PackCardsSlice` + compose + migration (TDD)

**Files:**
- Create: `src/store/pack-cards-slice.ts`
- Create: `src/store/pack-cards-slice.test.ts`
- Modify: `src/store/freshness.ts`
- Modify: `src/store/index.ts`

- [ ] **Step 1.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && pwd && git branch --show-current
```
Expected: worktree path + `phase-4/pack`. Run `bun install` if `node_modules` absent.

- [ ] **Step 1.2: Write the failing test**

Create `src/store/pack-cards-slice.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { create } from "zustand";
import type { HoloCardData } from "../components/holo-card";
import {
	type PackCardsSlice,
	createPackCardsSlice,
} from "./pack-cards-slice";

const sampleCards: HoloCardData[] = [
	{
		id: "base1-1",
		imageUrl: "https://example.invalid/1.png",
		name: "Alakazam",
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: "1",
	},
];

const fakeGetCardsBySet = mock(async (_setId: string) => ({
	cards: sampleCards,
	totalCount: sampleCards.length,
}));

mock.module("../api", () => ({
	getCardsBySet: fakeGetCardsBySet,
}));

function makeStore() {
	return create<PackCardsSlice>()((set, get, store) =>
		createPackCardsSlice(set, get, store),
	);
}

beforeEach(() => {
	fakeGetCardsBySet.mockClear();
});

afterEach(() => {
	fakeGetCardsBySet.mockClear();
});

describe("PackCardsSlice", () => {
	test("starts with empty packCards, packCardsFetchedAt, packCardsLoading", () => {
		const store = makeStore();
		expect(store.getState().packCards).toEqual({});
		expect(store.getState().packCardsFetchedAt).toEqual({});
		expect(store.getState().packCardsLoading).toEqual({});
	});

	test("loadPackCards(setId) populates the cache after fetch resolves", async () => {
		const store = makeStore();
		await store.getState().loadPackCards("base1");
		expect(store.getState().packCards.base1).toEqual(sampleCards);
		expect(typeof store.getState().packCardsFetchedAt.base1).toBe("number");
		expect(fakeGetCardsBySet).toHaveBeenCalledTimes(1);
	});

	test("loadPackCards is a no-op when the cache is still fresh", async () => {
		const store = makeStore();
		await store.getState().loadPackCards("base1");
		await store.getState().loadPackCards("base1");
		expect(fakeGetCardsBySet).toHaveBeenCalledTimes(1);
	});

	test("loadPackCards is a no-op when a load for the same setId is in flight", async () => {
		const store = makeStore();
		const a = store.getState().loadPackCards("base1");
		const b = store.getState().loadPackCards("base1");
		await Promise.all([a, b]);
		expect(fakeGetCardsBySet).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 1.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun test src/store/pack-cards-slice.test.ts
```
Expected: FAIL with "Cannot find module './pack-cards-slice'".

- [ ] **Step 1.4: Add `packCards` kind to `src/store/freshness.ts`**

Read the file. There's a discriminated union of cache kinds like `"sets"`, `"pokemonList"`, etc. Add `"packCards"` with a 7-day TTL (likely the same as `"sets"`).

If the file uses a `kind: "sets"` literal type, add `| "packCards"` to the union. If there's a `TTL_MS` map, add `packCards: 7 * 24 * 60 * 60 * 1000`. Read the actual structure and follow the existing pattern.

- [ ] **Step 1.5: Implement the slice**

Create `src/store/pack-cards-slice.ts`:

```ts
import type { StateCreator } from "zustand";
import { getCardsBySet } from "../api";
import type { HoloCardData } from "../components/holo-card";
import { shouldRefetch } from "./freshness";

const PACK_PAGE_SIZE = 250;

export interface PackCardsSlice {
	packCards: Record<string, HoloCardData[]>;
	packCardsFetchedAt: Record<string, number>;
	packCardsLoading: Record<string, boolean>;
	loadPackCards: (setId: string) => Promise<void>;
}

export const createPackCardsSlice: StateCreator<PackCardsSlice> = (
	set,
	get,
) => ({
	packCards: {},
	packCardsFetchedAt: {},
	packCardsLoading: {},

	loadPackCards: async (setId) => {
		const state = get();
		if (state.packCardsLoading[setId]) return;
		if (
			!shouldRefetch({
				lastFetchedAt: state.packCardsFetchedAt[setId] ?? null,
				kind: "packCards",
			})
		)
			return;

		set((s) => ({
			packCardsLoading: { ...s.packCardsLoading, [setId]: true },
		}));
		try {
			const { cards } = await getCardsBySet(setId, 1, PACK_PAGE_SIZE);
			set((s) => ({
				packCards: { ...s.packCards, [setId]: cards },
				packCardsFetchedAt: { ...s.packCardsFetchedAt, [setId]: Date.now() },
				packCardsLoading: { ...s.packCardsLoading, [setId]: false },
			}));
		} catch (e) {
			console.error(e);
			set((s) => ({
				packCardsLoading: { ...s.packCardsLoading, [setId]: false },
			}));
		}
	},
});
```

- [ ] **Step 1.6: Run slice tests pass**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun test src/store/pack-cards-slice.test.ts
```
Expected: 4 pass.

- [ ] **Step 1.7: Compose into `src/store/index.ts`**

Read the existing file. Currently it composes `ApiCacheSlice & CollectionSlice` and is at `STORAGE_VERSION = 3` with the v2→v3 migrate. Update:

```ts
import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { type ApiCacheSlice, createApiCacheSlice } from "./api-cache-slice";
import {
	type CollectionSlice,
	createCollectionSlice,
} from "./collection-slice";
import {
	type PackCardsSlice,
	createPackCardsSlice,
} from "./pack-cards-slice";

type AppStore = ApiCacheSlice & CollectionSlice & PackCardsSlice;

const STORAGE_VERSION = 4;

const composed: StateCreator<AppStore> = (set, get, store) => ({
	...createApiCacheSlice(set, get, store),
	...createCollectionSlice(set, get, store),
	...createPackCardsSlice(set, get, store),
});

export const useStore = create<AppStore>()(
	persist(composed, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
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
			owned: state.owned,
			packCards: state.packCards,
			packCardsFetchedAt: state.packCardsFetchedAt,
		}),
		migrate: (persisted, version) => {
			let next = persisted as Partial<AppStore>;
			if (version < 3) {
				next = { ...next, owned: {} };
			}
			if (version < 4) {
				next = { ...next, packCards: {}, packCardsFetchedAt: {} };
			}
			return next as AppStore;
		},
	}),
);
```

The migration chain handles users on v2 (gets `owned` AND `packCards`/`packCardsFetchedAt`) and v3 (gets just `packCards`/`packCardsFetchedAt`). v4 users pass through unchanged.

- [ ] **Step 1.8: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun run typecheck && bun run lint && bun test
```
Expected: 131 tests pass (127 baseline + 4 new). Typecheck clean. Lint shows only the pre-existing warning.

- [ ] **Step 1.9: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && git add src/store/pack-cards-slice.ts src/store/pack-cards-slice.test.ts src/store/freshness.ts src/store/index.ts && git commit -m "feat(store): add PackCardsSlice + v3→v4 migration

New slice mirrors ApiCacheSlice: per-set cached card list with
loading flag and lastFetchedAt. 7-day TTL via the existing
shouldRefetch policy. Storage v4 migration is additive — pre-Phase-4b
users keep their state and gain empty packCards/packCardsFetchedAt."
```

---

## Task 2: `rollPack` pure helper (TDD)

**Files:**
- Create: `src/utils/roll-pack.ts`
- Create: `src/utils/roll-pack.test.ts`

- [ ] **Step 2.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && pwd && git branch --show-current
```

- [ ] **Step 2.2: Write the failing test**

Create `src/utils/roll-pack.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { HoloCardData } from "../components/holo-card";
import { rollPack } from "./roll-pack";

function fixture(id: string, rarity?: string): HoloCardData {
	return {
		id,
		imageUrl: `https://example.invalid/${id}.png`,
		name: id,
		rarity,
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: id.split("-")[1] ?? "1",
	};
}

// Seeded RNG for deterministic tests. Mulberry32 from Wikipedia.
function seededRng(seed: number): () => number {
	let t = seed >>> 0;
	return () => {
		t = (t + 0x6d2b79f5) >>> 0;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

describe("rollPack", () => {
	test("returns 10 cards from a balanced pool with seeded RNG", () => {
		const pool: HoloCardData[] = [];
		for (let i = 0; i < 60; i++) pool.push(fixture(`c-${i}`, "Common"));
		for (let i = 0; i < 30; i++) pool.push(fixture(`u-${i}`, "Uncommon"));
		for (let i = 0; i < 10; i++) pool.push(fixture(`r-${i}`, "Rare Holo"));
		const pack = rollPack({ pool, rng: seededRng(42) });
		expect(pack).toHaveLength(10);
	});

	test("guarantees 1 rare-or-better in the pack", () => {
		const pool: HoloCardData[] = [];
		for (let i = 0; i < 60; i++) pool.push(fixture(`c-${i}`, "Common"));
		for (let i = 0; i < 30; i++) pool.push(fixture(`u-${i}`, "Uncommon"));
		for (let i = 0; i < 10; i++) pool.push(fixture(`r-${i}`, "Rare Holo"));
		const pack = rollPack({ pool, rng: seededRng(7) });
		const rares = pack.filter((c) => /^Rare/i.test(c.rarity ?? ""));
		expect(rares.length).toBeGreaterThanOrEqual(1);
	});

	test("has no within-pack duplicates", () => {
		const pool: HoloCardData[] = [];
		for (let i = 0; i < 60; i++) pool.push(fixture(`c-${i}`, "Common"));
		for (let i = 0; i < 30; i++) pool.push(fixture(`u-${i}`, "Uncommon"));
		for (let i = 0; i < 10; i++) pool.push(fixture(`r-${i}`, "Rare Holo"));
		const pack = rollPack({ pool, rng: seededRng(123) });
		const ids = new Set(pack.map((c) => c.id));
		expect(ids.size).toBe(pack.length);
	});

	test("falls back to random sample when no rarity tiers exist", () => {
		const pool: HoloCardData[] = [];
		for (let i = 0; i < 20; i++) pool.push(fixture(`x-${i}`)); // no rarity
		const pack = rollPack({ pool, rng: seededRng(0) });
		expect(pack).toHaveLength(10);
		const ids = new Set(pack.map((c) => c.id));
		expect(ids.size).toBe(10);
	});
});
```

- [ ] **Step 2.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun test src/utils/roll-pack.test.ts
```
Expected: FAIL with "Cannot find module './roll-pack'".

- [ ] **Step 2.4: Implement `src/utils/roll-pack.ts`**

```ts
import type { HoloCardData } from "../components/holo-card";

const DEFAULT_PACK_SIZE = 10;
const RARE_COUNT = 1;
const UNCOMMON_COUNT = 3;
const COMMON_COUNT = DEFAULT_PACK_SIZE - RARE_COUNT - UNCOMMON_COUNT;

export interface RollOptions {
	pool: HoloCardData[];
	rng?: () => number;
	packSize?: number;
}

function isRare(c: HoloCardData): boolean {
	return /^Rare/i.test(c.rarity ?? "");
}

function isUncommon(c: HoloCardData): boolean {
	return c.rarity === "Uncommon";
}

function isCommon(c: HoloCardData): boolean {
	return !c.rarity || c.rarity === "Common";
}

function sample(
	source: HoloCardData[],
	count: number,
	rng: () => number,
): HoloCardData[] {
	// Fisher-Yates partial shuffle, sample-without-replacement.
	const arr = [...source];
	const result: HoloCardData[] = [];
	const take = Math.min(count, arr.length);
	for (let i = 0; i < take; i++) {
		const idx = Math.floor(rng() * (arr.length - i)) + i;
		const tmp = arr[i];
		arr[i] = arr[idx];
		arr[idx] = tmp;
		result.push(arr[i]);
	}
	return result;
}

/**
 * Roll a single booster pack from a pool. Rarity-weighted: 1 rare-or-better,
 * 3 uncommons, 6 commons by default. Falls back to a random sample when
 * the pool has no rarity tiers. Sample-without-replacement (no within-pack
 * dupes).
 *
 * The optional `rng` argument lets tests inject seeded randomness.
 */
export function rollPack({
	pool,
	rng = Math.random,
	packSize = DEFAULT_PACK_SIZE,
}: RollOptions): HoloCardData[] {
	const rares = pool.filter(isRare);
	const uncommons = pool.filter(isUncommon);
	const commons = pool.filter(isCommon);

	// Fallback: if no rarity tiers populated, just random sample.
	if (rares.length + uncommons.length === 0) {
		return sample(pool, packSize, rng);
	}

	const picked: HoloCardData[] = [];
	const seen = new Set<string>();

	const pickFrom = (bucket: HoloCardData[], want: number) => {
		const remaining = bucket.filter((c) => !seen.has(c.id));
		const got = sample(remaining, want, rng);
		for (const c of got) {
			picked.push(c);
			seen.add(c.id);
		}
		return got.length;
	};

	const gotRare = pickFrom(rares, RARE_COUNT);
	const gotUncommon = pickFrom(uncommons, UNCOMMON_COUNT);
	const gotCommon = pickFrom(commons, COMMON_COUNT);

	// Top-up: if any bucket was short, top up from leftover pool.
	const deficit = packSize - (gotRare + gotUncommon + gotCommon);
	if (deficit > 0) {
		const leftovers = pool.filter((c) => !seen.has(c.id));
		const fill = sample(leftovers, deficit, rng);
		for (const c of fill) picked.push(c);
	}

	return picked;
}
```

- [ ] **Step 2.5: Run tests**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun test src/utils/roll-pack.test.ts
```
Expected: 4 pass.

- [ ] **Step 2.6: Verify full suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun run typecheck && bun run lint && bun test
```
Expected: 135 pass (131 + 4).

- [ ] **Step 2.7: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && git add src/utils/roll-pack.ts src/utils/roll-pack.test.ts && git commit -m "feat(utils): add rollPack rarity-weighted booster sampler

1 rare-or-better + 3 uncommons + 6 commons via sample-without-replacement.
Tops up from leftover pool when any bucket is short (tiny sets). Falls
back to a flat random sample when no rarity tiers exist. RNG is injectable
for deterministic tests."
```

---

## Task 3: `<BoosterPack>` component (TDD)

**Files:**
- Create: `src/components/booster-pack/index.ts`
- Create: `src/components/booster-pack/booster-pack.tsx`
- Create: `src/components/booster-pack/booster-pack.test.tsx`
- Create: `src/components/booster-pack/booster-pack.css`

- [ ] **Step 3.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && pwd && git branch --show-current
```

- [ ] **Step 3.2: Write the failing test**

Create `src/components/booster-pack/booster-pack.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import type { PokemonSet } from "../../api";
import { BoosterPack } from "./booster-pack";

const set: PokemonSet = {
	id: "base1",
	name: "Base",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 102,
	images: {
		symbol: "https://example.invalid/symbol.png",
		logo: "https://example.invalid/logo.png",
	},
};

describe("<BoosterPack />", () => {
	test("renders the set name and Rip to open label", () => {
		render(<BoosterPack set={set} ripped={false} onRip={() => {}} />);
		expect(screen.getByText(/Base/)).toBeDefined();
		expect(screen.getByText(/rip to open/i)).toBeDefined();
	});

	test("click fires onRip", () => {
		let calls = 0;
		render(<BoosterPack set={set} ripped={false} onRip={() => calls++} />);
		fireEvent.click(screen.getByRole("button", { name: /open .* booster/i }));
		expect(calls).toBe(1);
	});
});
```

- [ ] **Step 3.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun test src/components/booster-pack/booster-pack.test.tsx
```
Expected: FAIL with module-not-found.

- [ ] **Step 3.4: Implement `booster-pack.tsx`**

```tsx
import type { PokemonSet } from "../../api";
import "./booster-pack.css";

interface BoosterPackProps {
	set: PokemonSet;
	ripped: boolean;
	onRip: () => void;
}

export function BoosterPack({ set, ripped, onRip }: BoosterPackProps) {
	return (
		<button
			type="button"
			className={`booster-pack${ripped ? " ripped" : ""}`}
			aria-label={`Open the ${set.name} booster pack`}
			onClick={onRip}
		>
			<img
				className="booster-pack-logo"
				src={set.images.logo}
				alt={`${set.name} logo`}
			/>
			<img
				className="booster-pack-symbol"
				src={set.images.symbol}
				alt={`${set.name} symbol`}
			/>
			<span className="booster-pack-label">
				<strong>{set.name}</strong>
				<span>RIP TO OPEN</span>
			</span>
		</button>
	);
}
```

- [ ] **Step 3.5: Index**

Create `src/components/booster-pack/index.ts`:

```ts
export { BoosterPack } from "./booster-pack";
```

- [ ] **Step 3.6: CSS**

Create `src/components/booster-pack/booster-pack.css`:

```css
.booster-pack {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	width: min(340px, 80vw);
	aspect-ratio: 2 / 3;
	margin: 3rem auto;
	padding: 1.5rem 1rem;
	background: linear-gradient(140deg, #4c1d95 0%, #a21caf 60%, #4c1d95 100%);
	border: 2px solid rgba(255, 255, 255, 0.18);
	border-radius: 1.25rem;
	box-shadow:
		0 10px 30px rgba(0, 0, 0, 0.45),
		inset 0 1px 0 rgba(255, 255, 255, 0.2);
	color: #fff;
	cursor: pointer;
	transition:
		transform 0.32s ease-out,
		opacity 0.32s ease-out;
}

.booster-pack:hover,
.booster-pack:focus-visible {
	transform: translateY(-4px) scale(1.01);
	outline: none;
}

.booster-pack.ripped {
	transform: scale(0.92) rotateX(8deg);
	opacity: 0;
	pointer-events: none;
}

.booster-pack-logo {
	width: 80%;
	max-height: 50%;
	object-fit: contain;
	filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
}

.booster-pack-symbol {
	width: 3rem;
	height: 3rem;
	object-fit: contain;
}

.booster-pack-label {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	font-size: 0.95rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.booster-pack-label strong {
	font-size: 1.15rem;
	font-weight: 700;
}
```

- [ ] **Step 3.7: Run tests pass**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun test src/components/booster-pack/
```
Expected: 2 pass.

- [ ] **Step 3.8: Verify full suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun run typecheck && bun run lint && bun test
```
Expected: 137 pass (135 + 2).

- [ ] **Step 3.9: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && git add src/components/booster-pack/ && git commit -m "feat(booster-pack): add closed-pack visual component

Built from existing set images (logo + symbol) with a purple gradient
background. Single big button — click fires onRip. ripped prop triggers
the fade/scale-out transition that the pack-page consumes."
```

---

## Task 4: `<PackPage>` (TDD)

**Files:**
- Create: `src/pages/pack-page.tsx`
- Create: `src/pages/pack-page.test.tsx`
- Create: `src/pages/pack-page.css`

- [ ] **Step 4.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && pwd && git branch --show-current
```

- [ ] **Step 4.2: Write the failing test**

Create `src/pages/pack-page.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { HoloCardData, PokemonSet } from "../api";
import { useStore } from "../store";
import { PackPage } from "./pack-page";

function cardFx(id: string, rarity?: string): HoloCardData {
	return {
		id,
		imageUrl: `https://example.invalid/${id}.png`,
		name: id,
		rarity,
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: id.split("-")[1] ?? "1",
	};
}

const base1: PokemonSet = {
	id: "base1",
	name: "Base",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 102,
	images: {
		symbol: "https://example.invalid/symbol.png",
		logo: "https://example.invalid/logo.png",
	},
};

function renderRoute(setId: string) {
	const router = createMemoryRouter(
		[{ path: "/pack/:setId", element: <PackPage /> }],
		{ initialEntries: [`/pack/${setId}`] },
	);
	return render(<RouterProvider router={router} />);
}

beforeEach(() => {
	const pool: HoloCardData[] = [];
	for (let i = 0; i < 12; i++) pool.push(cardFx(`c-${i}`, "Common"));
	for (let i = 0; i < 6; i++) pool.push(cardFx(`u-${i}`, "Uncommon"));
	for (let i = 0; i < 3; i++) pool.push(cardFx(`r-${i}`, "Rare Holo"));
	useStore.setState({
		sets: [base1],
		packCards: { base1: pool },
		packCardsFetchedAt: { base1: Date.now() },
		packCardsLoading: {},
	});
});

afterEach(() => {
	useStore.setState({ sets: null, packCards: {}, packCardsFetchedAt: {} });
});

describe("<PackPage />", () => {
	test("renders the closed booster when no pack has been rolled yet", () => {
		renderRoute("base1");
		expect(screen.getByRole("button", { name: /open .* booster/i })).toBeDefined();
	});

	test("reveals 10 cards after clicking the booster", async () => {
		renderRoute("base1");
		fireEvent.click(screen.getByRole("button", { name: /open .* booster/i }));
		// The pack page uses a setTimeout for the rip animation; wait it out.
		await new Promise((r) => setTimeout(r, 380));
		const cards = await screen.findAllByRole("button");
		// Includes the cards (10) + the "Open another pack" button.
		const cardCount = cards.filter(
			(b) =>
				!/open another/i.test(b.textContent ?? "") &&
				b.getAttribute("aria-label")?.startsWith("c-") ||
				b.getAttribute("aria-label")?.startsWith("u-") ||
				b.getAttribute("aria-label")?.startsWith("r-"),
		).length;
		expect(cardCount).toBe(10);
	});
});
```

- [ ] **Step 4.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun test src/pages/pack-page.test.tsx
```
Expected: FAIL with module-not-found.

- [ ] **Step 4.4: Implement `src/pages/pack-page.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { BoosterPack } from "../components/booster-pack";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import "../components/header.css";
import { HoloCard, type HoloCardData } from "../components/holo-card";
import { useStore } from "../store";
import { rollPack } from "../utils/roll-pack";
import "./pack-page.css";

const RIP_DURATION_MS = 320;

export function PackPage() {
	const { setId } = useParams<{ setId: string }>();
	const navigate = useNavigate();
	const sets = useStore((s) => s.sets);
	const pool = useStore((s) => (setId ? s.packCards[setId] : undefined));
	const loading = useStore((s) => (setId ? s.packCardsLoading[setId] : false));
	const loadPackCards = useStore((s) => s.loadPackCards);
	const ownedMap = useStore((s) => s.owned);

	const set = sets?.find((x) => x.id === setId);

	const [ripped, setRipped] = useState(false);
	const [pack, setPack] = useState<HoloCardData[] | null>(null);

	useEffect(() => {
		if (setId) loadPackCards(setId);
	}, [setId, loadPackCards]);

	if (!setId) return null;
	if (!set) {
		return (
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Set not found</div>
						<div className="set-sub">No set with id "{setId}".</div>
					</div>
				</div>
			</header>
		);
	}

	const onRip = () => {
		if (!pool || pool.length === 0) return;
		setRipped(true);
		setTimeout(() => {
			setPack(rollPack({ pool }));
		}, RIP_DURATION_MS);
	};

	const onReroll = () => {
		setRipped(false);
		setPack(null);
	};

	return (
		<>
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Open a {set.name} pack</div>
						<div className="set-sub">
							{loading
								? "Loading set…"
								: pack
									? "10 cards revealed"
									: "Tap pack to rip"}
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
								subtypes={card.subtypes}
								supertype={card.supertype}
								setId={card.setId}
								cardNumber={card.cardNumber}
								owned={!!ownedMap[card.id]}
								size="focus"
								hoverOverlay={
									<>
										<CrossLinkOverlay
											links={[
												{
													label: `Go to ${set.name}`,
													to: `/?setId=${set.id}`,
												},
											]}
										/>
										<CollectionToggle card={card} />
									</>
								}
								onClick={(e) => {
									if (e.defaultPrevented) return;
									navigate(`/card/${card.id}`);
								}}
							/>
						))}
					</div>
					<div className="pack-reroll">
						<button
							type="button"
							className="pack-reroll-button"
							onClick={onReroll}
						>
							Open another pack
						</button>
					</div>
				</>
			)}
		</>
	);
}
```

- [ ] **Step 4.5: CSS**

Create `src/pages/pack-page.css`:

```css
.pack-reveal-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 1.25rem;
	padding: 1.5rem 1rem;
}

.pack-reroll {
	display: flex;
	justify-content: center;
	padding: 1.5rem 1rem 3rem;
}

.pack-reroll-button {
	padding: 0.85rem 2rem;
	background: rgba(120, 100, 255, 0.2);
	border: 1px solid rgba(120, 100, 255, 0.55);
	border-radius: 0.6rem;
	color: inherit;
	font-size: 1rem;
	cursor: pointer;
	transition: background 0.12s ease-out;
}

.pack-reroll-button:hover,
.pack-reroll-button:focus-visible {
	background: rgba(120, 100, 255, 0.32);
	outline: none;
}
```

- [ ] **Step 4.6: Run tests pass**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun test src/pages/pack-page.test.tsx
```
Expected: 2 pass.

- [ ] **Step 4.7: Verify full suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun run typecheck && bun run lint && bun test
```
Expected: 139 pass (137 + 2).

- [ ] **Step 4.8: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && git add src/pages/pack-page.tsx src/pages/pack-page.test.tsx src/pages/pack-page.css && git commit -m "feat(pack-page): add /pack/:setId route with rip + reveal flow

Loads the set's full card list via PackCardsSlice on mount, shows the
BoosterPack closed visual, rolls 10 cards via rollPack on rip, renders
them with HoloCard size=focus + CollectionToggle overlay. 'Open another
pack' button rerolls without refetching."
```

---

## Task 5: Header "Rip pack" link

**Files:**
- Modify: `src/components/header.tsx`
- Modify: `src/components/header.css`

- [ ] **Step 5.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && pwd && git branch --show-current
```

- [ ] **Step 5.2: Update `src/components/header.tsx`**

Read the existing file. Add a `<Link to={`/pack/${currentSet.id}`}>Rip pack</Link>` inside the `set-meta` block, after the existing text block. Use `react-router`'s `Link`.

```tsx
import { Link } from "react-router";
import type { PokemonSet } from "../api";
import "./header.css";

interface HeaderProps {
	currentSet: PokemonSet | undefined;
}

export function Header({ currentSet }: HeaderProps) {
	return (
		<header className="header">
			<h1>Pokémon TCG Holo Playground</h1>
			{currentSet && (
				<div className="set-meta">
					<img src={currentSet.images.logo} alt={currentSet.name} />
					<div>
						<div className="set-name">{currentSet.name}</div>
						<div className="set-sub">
							{currentSet.series} · {currentSet.releaseDate} ·{" "}
							{currentSet.total} cards
						</div>
					</div>
					<Link className="rip-pack-link" to={`/pack/${currentSet.id}`}>
						Rip pack
					</Link>
				</div>
			)}
		</header>
	);
}
```

- [ ] **Step 5.3: Append CSS to `src/components/header.css`**

```css
.rip-pack-link {
	margin-left: auto;
	padding: 0.55rem 1.1rem;
	background: rgba(120, 100, 255, 0.22);
	border: 1px solid rgba(120, 100, 255, 0.55);
	border-radius: 999px;
	color: inherit;
	font-size: 0.9rem;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-decoration: none;
	text-transform: uppercase;
	transition: background 0.12s ease-out;
}

.rip-pack-link:hover,
.rip-pack-link:focus-visible {
	background: rgba(120, 100, 255, 0.36);
	outline: none;
}
```

- [ ] **Step 5.4: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun run typecheck && bun run lint && bun test
```
Expected: 139 tests still pass.

- [ ] **Step 5.5: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && git add src/components/header.tsx src/components/header.css && git commit -m "feat(header): add Rip pack link in set header

Anchors to /pack/:setId for the currently selected set. Sits at the
right edge of the set-meta row via margin-left: auto."
```

---

## Task 6: Register `/pack/:setId` route

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 6.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && pwd && git branch --show-current
```

- [ ] **Step 6.2: Update `src/main.tsx`**

Add an import:

```tsx
import { PackPage } from "./pages/pack-page";
```

In the route children array, add a sibling route:

```tsx
{ path: "pack/:setId", element: <PackPage /> },
```

- [ ] **Step 6.3: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 139 tests pass. Build succeeds.

- [ ] **Step 6.4: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && git add src/main.tsx && git commit -m "feat(routes): register /pack/:setId route

PackPage handles its own data loading via the PackCardsSlice in useEffect;
no router loader needed."
```

---

## Task 7: Final verification + smoke

- [ ] **Step 7.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && pwd && git branch --show-current
```

- [ ] **Step 7.2: Full check**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 139 pass / 0 fail. Typecheck clean. Lint shows only the pre-existing `card-grid.css !important` warning. Build succeeds.

- [ ] **Step 7.3: Manual smoke (browser preview)**

Start dev server (`bun run dev`). Visit `http://localhost:5173/pokemon-tcg-viewer/`:

1. Page loads. Pick a set tab. "Rip pack" link appears in the set header.
2. Click "Rip pack". URL → `/pack/<setId>`. Closed pack visual fills page.
3. Click pack → fade-out → 10 cards reveal grid.
4. Cards show holo shine. Hover one → cross-link + collection toggle overlay.
5. Click "+" on a card → ✓ indicator + green border glow appears live.
6. Click "Open another pack" → 10 new cards.
7. Click any card → `/card/:id` opens.
8. Browser back → returns to pack page (with empty state since component remounts).
9. Direct visit to `/pack/<invalid>` → "Set not found" header.

- [ ] **Step 7.4: Update spec status**

Edit `docs/superpowers/specs/2026-05-03-phase-4b-pack-opening-design.md`. Change:

```markdown
**Status:** Approved (design)
```

to:

```markdown
**Status:** Implemented
```

Commit:

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pack && git add docs/superpowers/specs/2026-05-03-phase-4b-pack-opening-design.md && git commit -m "docs: mark Phase 4b pack-opening spec as implemented"
```

---

## Done criteria

- [ ] All tasks 1–7 above checked off.
- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` all pass on the worktree.
- [ ] Manual smoke confirms rip → reveal → collection toggle flow.
- [ ] Spec status reads "Implemented".

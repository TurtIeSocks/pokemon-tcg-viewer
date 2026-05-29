# Phase 3 / #1 — Collection / Binder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-03-phase-3-collection-design.md](../specs/2026-05-03-phase-3-collection-design.md)

**Goal:** Add a personal-collection feature: per-card "+/✓" toggle that persists to a Zustand slice, owned indicator on every card render, and a new `/collection` route that reuses Phase 2 #8 grid + timeline views.

**Architecture:** Zustand slice composed via existing `StateCreator` pattern with a 2 → 3 storage-version migration. Snapshot full `HoloCardData` at add time (Phase 5 PWA prerequisite). `<CollectionToggle>` placed in the existing `hoverOverlay` slot beside `<CrossLinkOverlay>`. `<HoloCard>` gains an `owned?: boolean` prop. `/collection` page reuses `useViewModeParam` + `<PokemonTimeline>` + a promoted `<ViewModeToggle>` from `pokemon-page.tsx`.

**Tech Stack:** React 19 + React Router 7 (data router), TypeScript, Vite 8, Bun (package + test), Biome, Zustand 5 + persist, happy-dom + @testing-library/react.

---

## File map

**Create:**
- `src/store/collection-slice.ts` — Zustand slice
- `src/store/collection-slice.test.ts`
- `src/components/collection-toggle/index.ts`
- `src/components/collection-toggle/collection-toggle.tsx`
- `src/components/collection-toggle/collection-toggle.test.tsx`
- `src/components/collection-toggle/collection-toggle.css`
- `src/components/view-mode-toggle/index.ts`
- `src/components/view-mode-toggle/view-mode-toggle.tsx` — promoted from inline in `pokemon-page.tsx`
- `src/components/view-mode-toggle/view-mode-toggle.css` — moved from `pokemon-page.css`
- `src/pages/collection-page.tsx`
- `src/pages/collection-page.test.tsx`
- `src/pages/collection-page.css`

**Modify:**
- `src/store/index.ts` — compose `CollectionSlice`; bump `STORAGE_VERSION` 2 → 3 with `migrate` + extend `partialize`
- `src/main.tsx` — register `/collection` route
- `src/root-layout.tsx` — add "Collection" `NavLink`
- `src/components/holo-card/holo-card.tsx` — accept `owned?: boolean`, add `holo-card--owned` class + ✓ corner badge
- `src/components/holo-card/holo-card.css` — owned indicator styles
- `src/pages/pokemon-page.tsx` — replace inline `ViewModeToggle` with import; extend `renderOverlay` to include `<CollectionToggle>`; read owned state per card via store
- `src/pages/pokemon-page.css` — remove view-mode-toggle styles (moved to component)
- `src/pages/sets-page.tsx` — extend `renderOverlay` to include `<CollectionToggle>`; read owned state per card
- `src/components/pokemon-timeline/pokemon-timeline.tsx` — read owned per card and pass to `<HoloCard>`
- `src/pages/card-page.tsx` — add prominent "Add / Remove from collection" button

---

## Task 1: `CollectionSlice` storage + tests (TDD)

**Files:**
- Create: `src/store/collection-slice.ts`
- Test: `src/store/collection-slice.test.ts`

The data foundation. Pure Zustand slice with three idempotent actions.

- [ ] **Step 1.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && pwd && git branch --show-current
```
Expected: worktree path + `phase-3/collection`. STOP and report BLOCKED otherwise.

- [ ] **Step 1.2: Write the failing test**

Create `src/store/collection-slice.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { create } from "zustand";
import type { HoloCardData } from "../components/holo-card";
import {
	type CollectionSlice,
	createCollectionSlice,
} from "./collection-slice";

function makeStore() {
	return create<CollectionSlice>()((set, get, store) =>
		createCollectionSlice(set, get, store),
	);
}

function fixture(id: string, overrides: Partial<HoloCardData> = {}): HoloCardData {
	return {
		id,
		imageUrl: `https://example.invalid/${id}.png`,
		name: overrides.name ?? "Test",
		setId: overrides.setId ?? "base1",
		setName: overrides.setName ?? "Base",
		setSeries: overrides.setSeries ?? "Base",
		setReleaseDate: overrides.setReleaseDate,
		cardNumber: overrides.cardNumber ?? "1",
		...overrides,
	};
}

describe("CollectionSlice", () => {
	test("starts with empty owned map", () => {
		const store = makeStore();
		expect(store.getState().owned).toEqual({});
	});

	test("addToCollection adds card with count 1 and addedAt timestamp", () => {
		const store = makeStore();
		const card = fixture("base1-58");
		store.getState().addToCollection(card);
		const entry = store.getState().owned["base1-58"];
		expect(entry).toBeDefined();
		expect(entry.card).toEqual(card);
		expect(entry.count).toBe(1);
		expect(typeof entry.addedAt).toBe("number");
	});

	test("addToCollection is idempotent — second add is a no-op", () => {
		const store = makeStore();
		const card = fixture("base1-58");
		store.getState().addToCollection(card);
		const firstAddedAt = store.getState().owned["base1-58"].addedAt;
		store.getState().addToCollection(card);
		const entry = store.getState().owned["base1-58"];
		expect(entry.count).toBe(1);
		expect(entry.addedAt).toBe(firstAddedAt);
	});

	test("removeFromCollection deletes the entry", () => {
		const store = makeStore();
		store.getState().addToCollection(fixture("base1-58"));
		store.getState().removeFromCollection("base1-58");
		expect(store.getState().owned["base1-58"]).toBeUndefined();
	});

	test("removeFromCollection on absent id is a no-op", () => {
		const store = makeStore();
		store.getState().removeFromCollection("never-added");
		expect(store.getState().owned).toEqual({});
	});

	test("clearCollection empties the map", () => {
		const store = makeStore();
		store.getState().addToCollection(fixture("a"));
		store.getState().addToCollection(fixture("b"));
		store.getState().clearCollection();
		expect(store.getState().owned).toEqual({});
	});
});
```

- [ ] **Step 1.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun test src/store/collection-slice.test.ts
```
Expected: FAIL with "Cannot find module './collection-slice'".

- [ ] **Step 1.4: Implement the slice**

Create `src/store/collection-slice.ts`:

```ts
import type { StateCreator } from "zustand";
import type { HoloCardData } from "../components/holo-card";

export interface OwnedCard {
	card: HoloCardData;
	count: number;
	addedAt: number;
}

export interface CollectionSlice {
	owned: Record<string, OwnedCard>;
	addToCollection: (card: HoloCardData) => void;
	removeFromCollection: (cardId: string) => void;
	clearCollection: () => void;
}

export const createCollectionSlice: StateCreator<CollectionSlice> = (
	set,
	get,
) => ({
	owned: {},

	addToCollection: (card) => {
		if (get().owned[card.id]) return; // idempotent
		set((s) => ({
			owned: {
				...s.owned,
				[card.id]: { card, count: 1, addedAt: Date.now() },
			},
		}));
	},

	removeFromCollection: (cardId) => {
		if (!get().owned[cardId]) return; // idempotent
		set((s) => {
			const next = { ...s.owned };
			delete next[cardId];
			return { owned: next };
		});
	},

	clearCollection: () => set({ owned: {} }),
});
```

- [ ] **Step 1.5: Run tests**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun test src/store/collection-slice.test.ts
```
Expected: 6 pass, 0 fail.

- [ ] **Step 1.6: Verify whole suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run typecheck && bun run lint && bun test
```
Expected: 110 total pass (104 baseline + 6 new). Typecheck clean. Lint only the pre-existing `card-grid.css !important` warning.

- [ ] **Step 1.7: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && git add src/store/collection-slice.ts src/store/collection-slice.test.ts && git commit -m "feat(store): add CollectionSlice for personal binder

Idempotent add/remove/clear actions. owned is a Record<cardId, OwnedCard>
where each entry snapshots the full HoloCardData plus count (always 1
in v1 UI) and addedAt. Snapshot enables offline browsing in Phase 5."
```

---

## Task 2: Compose `CollectionSlice` into `useStore` + storage migration

**Files:**
- Modify: `src/store/index.ts`

Plumb the new slice into the persisted store. Bump version 2 → 3 with an additive migration so existing users keep their api-cache.

- [ ] **Step 2.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && pwd && git branch --show-current
```

- [ ] **Step 2.2: Update `src/store/index.ts`**

Read the existing file first to confirm the structure. Then replace the contents:

```ts
import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { type ApiCacheSlice, createApiCacheSlice } from "./api-cache-slice";
import {
	type CollectionSlice,
	createCollectionSlice,
} from "./collection-slice";

type AppStore = ApiCacheSlice & CollectionSlice;

// Bump if the persisted shape changes in a non-additive way and you want to
// drop old data instead of writing a migration. Phase 1 #5 only ADDS fields,
// so was kept at 2. Phase 3 #1 adds `owned: {}` via the additive migration
// below; bumped to 3.
const STORAGE_VERSION = 3;

const composed: StateCreator<AppStore> = (set, get, store) => ({
	...createApiCacheSlice(set, get, store),
	...createCollectionSlice(set, get, store),
});

export const useStore = create<AppStore>()(
	persist(composed, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
		// Mirror cache data + collection to localStorage. Loading flags stay in memory.
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
		}),
		// Pre-Phase-3 persisted state has no `owned` key. Add it without
		// dropping the api-cache data so users don't lose their snapshot.
		migrate: (persisted, version) => {
			if (version < 3) {
				return {
					...(persisted as Partial<AppStore>),
					owned: {},
				} as AppStore;
			}
			return persisted as AppStore;
		},
	}),
);
```

- [ ] **Step 2.3: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run typecheck && bun run lint && bun test
```
Expected: 110 tests still pass. Typecheck clean. Lint only the pre-existing warning. No new tests yet — slice integration is tested at the higher levels (Tasks 4, 6).

- [ ] **Step 2.4: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && git add src/store/index.ts && git commit -m "feat(store): compose CollectionSlice; bump storage version 2→3

Migration is additive: existing users on version 2 keep their api-cache
state and gain an empty owned: {} field. No data drop. Loading flags
remain memory-only via partialize."
```

---

## Task 3: `HoloCard` owned indicator

**Files:**
- Modify: `src/components/holo-card/holo-card.tsx`
- Modify: `src/components/holo-card/holo-card.css`

Add an optional `owned?: boolean` prop. When true, adds a class for a subtle border glow and a small ✓ corner badge.

- [ ] **Step 3.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && pwd && git branch --show-current
```

- [ ] **Step 3.2: Update `src/components/holo-card/holo-card.tsx`**

Read the existing file. The `HoloCardProps` interface has these fields: `imageUrl`, `name`, `rarity`, `subtypes`, `supertype`, `setId`, `cardNumber`, `onClick`, `hoverOverlay`, `size`, `className`, `style`.

Add `owned?: boolean` after `cardNumber`:

```ts
export interface HoloCardProps {
	imageUrl: string;
	name: string;
	rarity?: string;
	subtypes?: string[];
	supertype?: string;
	setId?: string;
	cardNumber?: string;
	owned?: boolean;

	onClick?: (e: React.MouseEvent | React.KeyboardEvent) => void;
	hoverOverlay?: React.ReactNode;
	size?: "grid" | "focus";

	className?: string;
	style?: React.CSSProperties;
}
```

Destructure it in the function:

```ts
export function HoloCard({
	imageUrl,
	name,
	rarity,
	owned = false,
	onClick,
	hoverOverlay,
	size = "grid",
	className,
	style,
}: HoloCardProps) {
```

Add `holo-card--owned` to the class list when truthy. Find the existing `classes` line:

```ts
const classes = ["holo-card", `size-${size}`, rarityClass, className]
	.filter(Boolean)
	.join(" ");
```

Change to:

```ts
const classes = [
	"holo-card",
	`size-${size}`,
	rarityClass,
	owned ? "holo-card--owned" : null,
	className,
]
	.filter(Boolean)
	.join(" ");
```

Inside the card's JSX (after the `<img>` and overlay slot, but before the closing `</div>` of the card), add the corner badge — only when `owned` is true:

```tsx
{owned && (
	<span className="holo-card-owned-badge" aria-label="In your collection">
		✓
	</span>
)}
```

The exact placement inside the JSX: it should be a sibling of the image/overlay container, absolute-positioned via CSS. Read the file to find the right location — typically the last child inside the outermost `<div>` of the card.

- [ ] **Step 3.3: Append owned-indicator CSS to `src/components/holo-card/holo-card.css`**

```css
/* Phase 3 #1 — owned indicator: subtle outer glow + corner ✓. */
.holo-card--owned {
	box-shadow:
		0 0 0 2px rgba(80, 200, 120, 0.6),
		0 0 20px rgba(80, 200, 120, 0.3);
}

.holo-card-owned-badge {
	position: absolute;
	top: 0.4rem;
	right: 0.4rem;
	z-index: 3;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.5rem;
	height: 1.5rem;
	background: rgba(80, 200, 120, 0.95);
	color: #fff;
	border-radius: 50%;
	font-size: 0.9rem;
	font-weight: 700;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
	pointer-events: none;
}
```

- [ ] **Step 3.4: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run typecheck && bun run lint && bun test
```
Expected: 110 tests still pass. Typecheck clean. Lint clean.

- [ ] **Step 3.5: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && git add src/components/holo-card/holo-card.tsx src/components/holo-card/holo-card.css && git commit -m "feat(holo-card): add owned prop for collection indicator

When owned=true, adds a green outer glow + corner ✓ badge. Default
false. Consumers (set page, pokemon page, timeline) will pass
useStore(s => !!s.owned[card.id]) in subsequent tasks."
```

---

## Task 4: `<CollectionToggle>` component (TDD)

**Files:**
- Create: `src/components/collection-toggle/index.ts`
- Create: `src/components/collection-toggle/collection-toggle.tsx`
- Create: `src/components/collection-toggle/collection-toggle.test.tsx`
- Create: `src/components/collection-toggle/collection-toggle.css`

A small button that lives in the hover-overlay slot. Reads owned state from the store and toggles add/remove.

- [ ] **Step 4.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && pwd && git branch --show-current
```

- [ ] **Step 4.2: Write the failing test**

Create `src/components/collection-toggle/collection-toggle.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import type { HoloCardData } from "../holo-card";
import { useStore } from "../../store";
import { CollectionToggle } from "./collection-toggle";

const card: HoloCardData = {
	id: "base1-58",
	imageUrl: "https://example.invalid/p.png",
	name: "Pikachu",
	setId: "base1",
	setName: "Base",
	setSeries: "Base",
	cardNumber: "58",
};

afterEach(() => {
	useStore.setState({ owned: {} });
});

describe("<CollectionToggle />", () => {
	test("renders '+' button when card is not owned", () => {
		render(<CollectionToggle card={card} />);
		const btn = screen.getByRole("button", { name: /add .* collection/i });
		expect(btn.textContent).toBe("+");
	});

	test("renders '✓' button when card is owned", () => {
		useStore.getState().addToCollection(card);
		render(<CollectionToggle card={card} />);
		const btn = screen.getByRole("button", {
			name: /remove .* collection/i,
		});
		expect(btn.textContent).toBe("✓");
	});

	test("click adds card when absent", () => {
		render(<CollectionToggle card={card} />);
		fireEvent.click(screen.getByRole("button"));
		expect(useStore.getState().owned[card.id]).toBeDefined();
	});

	test("click removes card when present", () => {
		useStore.getState().addToCollection(card);
		render(<CollectionToggle card={card} />);
		fireEvent.click(screen.getByRole("button"));
		expect(useStore.getState().owned[card.id]).toBeUndefined();
	});
});
```

- [ ] **Step 4.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun test src/components/collection-toggle/collection-toggle.test.tsx
```
Expected: FAIL with "Cannot find module './collection-toggle'".

- [ ] **Step 4.4: Implement the component**

Create `src/components/collection-toggle/collection-toggle.tsx`:

```tsx
import { useStore } from "../../store";
import type { HoloCardData } from "../holo-card";
import "./collection-toggle.css";

interface CollectionToggleProps {
	card: HoloCardData;
}

export function CollectionToggle({ card }: CollectionToggleProps) {
	const owned = useStore((s) => !!s.owned[card.id]);
	const add = useStore((s) => s.addToCollection);
	const remove = useStore((s) => s.removeFromCollection);

	const label = owned
		? `Remove ${card.name} from collection`
		: `Add ${card.name} to collection`;

	return (
		<button
			type="button"
			className={`collection-toggle${owned ? " owned" : ""}`}
			aria-label={label}
			aria-pressed={owned}
			onClick={(e) => {
				// Prevent the card-body onClick (navigate to /card/:id) from firing.
				// The Phase 2 #2a guard in <CardGrid> and <PokemonTimeline> reads
				// e.defaultPrevented on the bubbled event.
				e.preventDefault();
				if (owned) remove(card.id);
				else add(card);
			}}
		>
			{owned ? "✓" : "+"}
		</button>
	);
}
```

- [ ] **Step 4.5: Create the index module**

Create `src/components/collection-toggle/index.ts`:

```ts
export { CollectionToggle } from "./collection-toggle";
```

- [ ] **Step 4.6: Create the CSS**

Create `src/components/collection-toggle/collection-toggle.css`:

```css
/*
 * Compact pill button rendered inside the HoloCard hoverOverlay slot,
 * alongside <CrossLinkOverlay>. Add (+) or remove (✓) the card from
 * the personal collection.
 */
.collection-toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2rem;
	height: 2rem;
	background: rgba(0, 0, 0, 0.6);
	color: #fff;
	border: 1px solid rgba(255, 255, 255, 0.3);
	border-radius: 50%;
	font-size: 1rem;
	font-weight: 700;
	cursor: pointer;
	transition:
		background 0.12s ease-out,
		transform 0.12s ease-out;
}

.collection-toggle:hover,
.collection-toggle:focus-visible {
	background: rgba(0, 0, 0, 0.85);
	transform: scale(1.08);
	outline: none;
}

.collection-toggle.owned {
	background: rgba(80, 200, 120, 0.92);
	border-color: rgba(80, 200, 120, 1);
}

.collection-toggle.owned:hover,
.collection-toggle.owned:focus-visible {
	background: rgba(60, 180, 100, 1);
}
```

- [ ] **Step 4.7: Run tests**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun test src/components/collection-toggle/
```
Expected: 4 pass, 0 fail.

- [ ] **Step 4.8: Verify whole suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run typecheck && bun run lint && bun test
```
Expected: 114 total pass (110 + 4 new). Typecheck clean.

- [ ] **Step 4.9: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && git add src/components/collection-toggle/ && git commit -m "feat(collection-toggle): add hover-overlay add/remove button

Reads owned state from store, toggles via add/removeFromCollection.
e.preventDefault() stops the card-body onClick (which navigates to
/card/:id) — relies on Phase 2 #2a's defaultPrevented guard."
```

---

## Task 5: Promote `<ViewModeToggle>` from inline to shared component

**Files:**
- Create: `src/components/view-mode-toggle/index.ts`
- Create: `src/components/view-mode-toggle/view-mode-toggle.tsx`
- Create: `src/components/view-mode-toggle/view-mode-toggle.css`
- Modify: `src/pages/pokemon-page.tsx` — remove inline definition + import from new location
- Modify: `src/pages/pokemon-page.css` — remove `.view-mode-toggle*` rules

Phase 2 #8 left `<ViewModeToggle>` inline in `pokemon-page.tsx` because there was only one consumer. The `/collection` page is the second consumer — extract.

- [ ] **Step 5.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && pwd && git branch --show-current
```

- [ ] **Step 5.2: Create `src/components/view-mode-toggle/view-mode-toggle.tsx`**

Copy the inline component verbatim from `src/pages/pokemon-page.tsx`. The current shape is:

```tsx
import type { ViewMode } from "../../hooks/use-url-selection";
import "./view-mode-toggle.css";

interface ViewModeToggleProps {
	value: ViewMode;
	onChange: (next: ViewMode) => void;
	disabled: boolean;
}

export function ViewModeToggle({
	value,
	onChange,
	disabled,
}: ViewModeToggleProps) {
	// fieldset+aria-label is used (over div+role="group") to satisfy Biome's
	// useSemanticElements rule. The CSS below resets fieldset's default border,
	// padding, margin, and min-inline-size to make it look like a pill group.
	return (
		<fieldset className="view-mode-toggle" aria-label="View mode">
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
		</fieldset>
	);
}
```

- [ ] **Step 5.3: Create the index module**

Create `src/components/view-mode-toggle/index.ts`:

```ts
export { ViewModeToggle } from "./view-mode-toggle";
```

- [ ] **Step 5.4: Move CSS into `src/components/view-mode-toggle/view-mode-toggle.css`**

Copy all `.view-mode-toggle*` rules from `src/pages/pokemon-page.css` into the new file. Remove them from `pokemon-page.css`. Result for the new file:

```css
.view-mode-toggle {
	display: inline-flex;
	gap: 0.25rem;
	padding: 0.25rem;
	margin: 0;
	min-inline-size: 0;
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

Read `src/pages/pokemon-page.css` and remove the same selectors from there.

- [ ] **Step 5.5: Update `src/pages/pokemon-page.tsx`**

Remove the inline `ViewModeToggleProps` interface and the inline `ViewModeToggle` function. Replace with an import:

```tsx
import { ViewModeToggle } from "../components/view-mode-toggle";
```

(Place alphabetically in the existing component import block. Biome will sort.)

The JSX usage stays the same: `<ViewModeToggle value={view} onChange={setView} disabled={pokedexNumber === null} />`.

- [ ] **Step 5.6: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run typecheck && bun run lint && bun test
```
Expected: 114 tests still pass (no behavior change — `pokemon-page` tests should be identical). Typecheck clean.

- [ ] **Step 5.7: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && git add src/components/view-mode-toggle/ src/pages/pokemon-page.tsx src/pages/pokemon-page.css && git commit -m "refactor(view-mode-toggle): promote from inline to shared component

The collection page needs the same toggle UI as pokemon-page. Extract
to src/components/view-mode-toggle/ so both pages can import it. No
behavior change — pixel-identical render, same prop shape."
```

---

## Task 6: `/collection` page (TDD)

**Files:**
- Create: `src/pages/collection-page.tsx`
- Create: `src/pages/collection-page.test.tsx`
- Create: `src/pages/collection-page.css`

The new route. Reads owned cards from the store, renders empty state if none, or grid/timeline view.

- [ ] **Step 6.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && pwd && git branch --show-current
```

- [ ] **Step 6.2: Write the failing test**

Create `src/pages/collection-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { HoloCardData } from "../components/holo-card";
import { useStore } from "../store";
import { CollectionPage } from "./collection-page";

function fixture(id: string, overrides: Partial<HoloCardData> = {}): HoloCardData {
	return {
		id,
		imageUrl: `https://example.invalid/${id}.png`,
		name: overrides.name ?? "Pikachu",
		setId: overrides.setId ?? "base1",
		setName: overrides.setName ?? "Base",
		setSeries: overrides.setSeries ?? "Base",
		setReleaseDate: overrides.setReleaseDate,
		cardNumber: overrides.cardNumber ?? "58",
		...overrides,
	};
}

function renderRoute(path: string) {
	const router = createMemoryRouter(
		[{ path: "/collection", element: <CollectionPage /> }],
		{ initialEntries: [path] },
	);
	return render(<RouterProvider router={router} />);
}

afterEach(() => {
	useStore.setState({ owned: {} });
});

describe("<CollectionPage />", () => {
	test("renders empty state when no cards owned", () => {
		renderRoute("/collection");
		expect(screen.getByText(/no cards yet/i)).toBeDefined();
	});

	test("renders owned cards in grid view", () => {
		useStore.getState().addToCollection(fixture("base1-58"));
		useStore.getState().addToCollection(fixture("base1-4"));
		renderRoute("/collection");
		expect(screen.getAllByLabelText("Pikachu")).toHaveLength(2);
	});

	test("renders owned cards in timeline view when ?view=timeline", () => {
		useStore.getState().addToCollection(
			fixture("base1-58", { setReleaseDate: "1999-01-09" }),
		);
		useStore.getState().addToCollection(
			fixture("neo1-12", {
				setName: "Neo Genesis",
				setSeries: "Neo",
				setReleaseDate: "2000-12-16",
			}),
		);
		renderRoute("/collection?view=timeline");
		expect(screen.getByRole("heading", { name: /Base/i })).toBeDefined();
		expect(screen.getByRole("heading", { name: /Neo/i })).toBeDefined();
	});

	test("renders count summary in header (N copies · M unique)", () => {
		useStore.getState().addToCollection(fixture("base1-58"));
		useStore.getState().addToCollection(fixture("base1-4"));
		renderRoute("/collection");
		expect(screen.getByText(/2 copies · 2 unique/i)).toBeDefined();
	});
});
```

- [ ] **Step 6.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun test src/pages/collection-page.test.tsx
```
Expected: FAIL with "Cannot find module './collection-page'".

- [ ] **Step 6.4: Implement the page**

Create `src/pages/collection-page.tsx`:

```tsx
import "../components/header.css";
import { CardGrid } from "../components/card-grid";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import type { HoloCardData } from "../components/holo-card";
import { PokemonTimeline } from "../components/pokemon-timeline";
import { ViewModeToggle } from "../components/view-mode-toggle";
import { useViewModeParam } from "../hooks/use-url-selection";
import { useStore } from "../store";
import "./collection-page.css";

function renderOverlay(card: HoloCardData) {
	return (
		<>
			<CrossLinkOverlay
				links={[{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` }]}
			/>
			<CollectionToggle card={card} />
		</>
	);
}

export function CollectionPage() {
	const [view, setView] = useViewModeParam();
	const owned = useStore((s) => s.owned);
	const entries = Object.values(owned);
	const cards = entries.map((o) => o.card);
	const unique = entries.length;
	const copies = entries.reduce((n, o) => n + o.count, 0);

	return (
		<>
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Your Collection</div>
						<div className="set-sub">
							{unique === 0
								? "No cards yet — tap + on any card to add it"
								: `${copies} copies · ${unique} unique`}
						</div>
					</div>
					<ViewModeToggle
						value={view}
						onChange={setView}
						disabled={unique === 0}
					/>
				</div>
			</header>
			{unique === 0 ? (
				<div className="collection-empty">
					<p>Your binder is empty. Add cards from any view.</p>
				</div>
			) : view === "grid" ? (
				<CardGrid
					setId="collection"
					cards={cards}
					onEndReached={() => {}}
					renderOverlay={renderOverlay}
				/>
			) : (
				<PokemonTimeline
					cards={cards}
					loading={false}
					hasMore={false}
					onLoadMore={() => {}}
					renderOverlay={renderOverlay}
				/>
			)}
		</>
	);
}
```

- [ ] **Step 6.5: Create the CSS**

Create `src/pages/collection-page.css`:

```css
.collection-empty {
	padding: 3rem 1rem;
	color: rgba(255, 255, 255, 0.6);
	text-align: center;
}
```

- [ ] **Step 6.6: Run tests**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun test src/pages/collection-page.test.tsx
```
Expected: 4 pass, 0 fail.

- [ ] **Step 6.7: Verify whole suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run typecheck && bun run lint && bun test
```
Expected: 118 total pass (114 + 4 new). Typecheck clean.

- [ ] **Step 6.8: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && git add src/pages/collection-page.tsx src/pages/collection-page.test.tsx src/pages/collection-page.css && git commit -m "feat(collection-page): add /collection route with grid + timeline views

Reads owned from the store; renders empty state when none. Reuses
Phase 2 #8 ViewModeToggle + PokemonTimeline. Overlay composes
CrossLinkOverlay (set link) + CollectionToggle (remove from binder)."
```

---

## Task 7: Wire `<CollectionToggle>` + owned indicator into existing pages

**Files:**
- Modify: `src/pages/sets-page.tsx`
- Modify: `src/pages/pokemon-page.tsx`
- Modify: `src/components/pokemon-timeline/pokemon-timeline.tsx`

Three call sites pass `renderOverlay` and `<HoloCard owned={...}>`. Update each.

- [ ] **Step 7.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && pwd && git branch --show-current
```

- [ ] **Step 7.2: Update `src/pages/sets-page.tsx`**

Read the existing file. The page calls `<CardGrid>` with a `renderOverlay`. Find the `renderOverlay` function (likely at module scope, returning `<CrossLinkOverlay links={[...]} />`).

Wrap it with the `CollectionToggle`. Imports to add (Biome will sort):

```tsx
import { CollectionToggle } from "../components/collection-toggle";
```

Change `renderOverlay` to:

```tsx
function renderOverlay(card: HoloCardData) {
	return (
		<>
			<CrossLinkOverlay
				links={[
					{ label: `Go to ${card.name}`, to: `/pokemon?dex=${card.nationalPokedexNumbers?.[0]}` },
				]}
			/>
			<CollectionToggle card={card} />
		</>
	);
}
```

(Preserve the original cross-link target — `sets-page.tsx` links to `/pokemon?dex=...`; do NOT replace with the `/?setId=` link from `pokemon-page.tsx`. Read the file to confirm the actual original link shape.)

For owned indicator on the cards: `<CardGrid>` doesn't currently expose `owned` per card. Reading the existing implementation: `<CardGrid>` likely maps cards to `<HoloCard>` itself. The cleanest path is to add an `owned` prop computation inside `<CardGrid>`, OR to compute it in the caller and pass via a prop on `<CardGrid>`.

Read `src/components/card-grid.tsx` and decide. The right pattern: `<CardGrid>` itself reads the store and passes `owned={!!owned[card.id]}` to each `<HoloCard>` — this avoids forcing every caller to re-implement the lookup. Add the read inside `<CardGrid>`:

In `src/components/card-grid.tsx`, add:

```tsx
import { useStore } from "../store";
```

Inside the component function:

```tsx
const owned = useStore((s) => s.owned);
```

And on the `<HoloCard>` render:

```tsx
<HoloCard
	// ...existing props...
	owned={!!owned[card.id]}
/>
```

- [ ] **Step 7.3: Update `src/pages/pokemon-page.tsx`**

Imports to add:

```tsx
import { CollectionToggle } from "../components/collection-toggle";
```

Change the existing `renderOverlay` to compose:

```tsx
function renderOverlay(card: HoloCardData) {
	return (
		<>
			<CrossLinkOverlay
				links={[{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` }]}
			/>
			<CollectionToggle card={card} />
		</>
	);
}
```

(The CardGrid owned-indicator wire-up from Step 7.2 already covers this page's grid view.)

- [ ] **Step 7.4: Update `src/components/pokemon-timeline/pokemon-timeline.tsx`**

Add a store read so timeline-rendered cards also show the owned indicator. Add an import:

```tsx
import { useStore } from "../../store";
```

Inside the component, read owned state:

```tsx
const owned = useStore((s) => s.owned);
```

And on the `<HoloCard>` inside `era.cards.map(...)`, add the prop:

```tsx
<HoloCard
	key={card.id}
	imageUrl={card.imageUrl}
	name={card.name}
	rarity={card.rarity}
	subtypes={card.subtypes}
	supertype={card.supertype}
	setId={card.setId}
	cardNumber={card.cardNumber}
	owned={!!owned[card.id]}
	hoverOverlay={renderOverlay?.(card)}
	onClick={(e) => {
		if (e.defaultPrevented) return;
		navigate(`/card/${card.id}`);
	}}
	style={{ width: 300 }}
/>
```

- [ ] **Step 7.5: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run typecheck && bun run lint && bun test
```
Expected: 118 tests still pass (no new tests; existing tests for these files should continue to pass — `CollectionToggle` rendering inside the overlay is invisible to tests that don't query for it; owned defaults to false when store is reset).

If a test fails because of unexpected store mutations leaking between tests (e.g., the `<CollectionToggle>` tests' `afterEach` not running), check that the test file resets `useStore.setState({ owned: {} })` in `beforeEach` or `afterEach`.

- [ ] **Step 7.6: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && git add src/pages/sets-page.tsx src/pages/pokemon-page.tsx src/components/pokemon-timeline/pokemon-timeline.tsx src/components/card-grid.tsx && git commit -m "feat(views): wire CollectionToggle + owned indicator across views

Every <CardGrid> instance now reads owned from the store and passes
owned prop to each <HoloCard>. The hover-overlay slot on sets-page,
pokemon-page, and the timeline composes <CrossLinkOverlay> with
<CollectionToggle>. No new behavior on card click — owned cards still
navigate to /card/:id; the toggle uses e.preventDefault() per the
Phase 2 #2a pattern."
```

---

## Task 8: Focus view button + `/collection` route registration + nav link

**Files:**
- Modify: `src/pages/card-page.tsx`
- Modify: `src/pages/card-page.css`
- Modify: `src/main.tsx`
- Modify: `src/root-layout.tsx`

Three small changes for the last surfaces.

- [ ] **Step 8.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && pwd && git branch --show-current
```

- [ ] **Step 8.2: Add a prominent collection button to `src/pages/card-page.tsx`**

Read the file. Find the action area near the card header (where the back button or title sits). Add a button:

Imports to add:

```tsx
import { useStore } from "../store";
```

Inside the page component, near the existing `useLoaderData()` line:

```tsx
const card = useLoaderData() as FocusCardData;
const owned = useStore((s) => !!s.owned[card.id]);
const add = useStore((s) => s.addToCollection);
const remove = useStore((s) => s.removeFromCollection);
```

In the JSX, place the button in a sensible spot (e.g., right after the title or in the action row). Reuse the lean shape:

```tsx
<button
	type="button"
	className={`card-page-collection-button${owned ? " owned" : ""}`}
	aria-pressed={owned}
	onClick={() => {
		if (owned) remove(card.id);
		else add(toHoloCardData(card));
	}}
>
	{owned ? "✓ In your collection — Remove" : "+ Add to collection"}
</button>
```

Note: `useLoaderData` returns `FocusCardData` (richer than `HoloCardData`). The collection slice expects `HoloCardData`. Convert at the call site with a small helper at the top of the file:

```tsx
import type { FocusCardData } from "../api";
import type { HoloCardData } from "../components/holo-card";

function toHoloCardData(card: FocusCardData): HoloCardData {
	return {
		id: card.id,
		imageUrl: card.imageUrl,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		supertype: card.supertype,
		setId: card.setId,
		setName: card.setName,
		setSeries: card.setSeries,
		setReleaseDate: card.setReleaseDate,
		cardNumber: card.cardNumber,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
	};
}
```

Read `src/api.ts` to confirm which of these fields exist on `FocusCardData`. Adapt the helper accordingly — only include fields that exist on both shapes. If `FocusCardData` lacks `setSeries` / `setReleaseDate`, omit them in the helper and the slice will store the snapshot with those fields undefined; the collection page's timeline grouping will bucket them under "Other".

- [ ] **Step 8.3: Append button CSS to `src/pages/card-page.css`**

```css
.card-page-collection-button {
	padding: 0.65rem 1.5rem;
	margin-top: 0.75rem;
	background: rgba(120, 100, 255, 0.18);
	border: 1px solid rgba(120, 100, 255, 0.5);
	border-radius: 8px;
	color: inherit;
	font-size: 0.95rem;
	cursor: pointer;
	transition: background 0.12s ease-out;
}

.card-page-collection-button:hover,
.card-page-collection-button:focus-visible {
	background: rgba(120, 100, 255, 0.3);
	outline: none;
}

.card-page-collection-button.owned {
	background: rgba(80, 200, 120, 0.18);
	border-color: rgba(80, 200, 120, 0.6);
}

.card-page-collection-button.owned:hover,
.card-page-collection-button.owned:focus-visible {
	background: rgba(80, 200, 120, 0.3);
}
```

- [ ] **Step 8.4: Register `/collection` route in `src/main.tsx`**

Add an import:

```tsx
import { CollectionPage } from "./pages/collection-page";
```

In the route table, add a route as a sibling of the existing `pokemon` and `card/:id` routes:

```tsx
{ path: "collection", element: <CollectionPage /> },
```

- [ ] **Step 8.5: Add "Collection" nav link in `src/root-layout.tsx`**

After the existing "By Pokémon" `NavLink`, add:

```tsx
<NavLink
	to="/collection"
	className={({ isActive }) =>
		isActive ? "primary-nav-link active" : "primary-nav-link"
	}
>
	Collection
</NavLink>
```

- [ ] **Step 8.6: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 118 tests still pass. Typecheck clean. Lint clean. Build succeeds.

- [ ] **Step 8.7: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && git add src/pages/card-page.tsx src/pages/card-page.css src/main.tsx src/root-layout.tsx && git commit -m "feat(routes): register /collection + nav link + focus-view button

Adds the prominent Add/Remove button to /card/:id (no hover overlay
there), registers the collection route, and adds the third primary nav
link 'Collection' alongside 'By Set' and 'By Pokémon'."
```

---

## Task 9: Final verification + smoke test

**Files:** none (read-only verification)

- [ ] **Step 9.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && pwd && git branch --show-current
```

- [ ] **Step 9.2: Run all checks**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run typecheck
```
Expected: zero errors.

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run lint
```
Expected: only the pre-existing `card-grid.css !important` warning.

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun test
```
Expected: 118 pass / 0 fail.

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run build
```
Expected: success. Pre-existing texture-path runtime-resolved warnings are unchanged.

- [ ] **Step 9.3: Manual smoke test in dev**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && bun run dev
```

In a browser at `http://localhost:5173/pokemon-tcg-viewer/`:

1. Land on `/`. Pick a set. Hover any card → "+" overlay button is visible alongside cross-link. Click "+" → ✓ corner badge appears + green border glow. Click again → indicator gone.
2. Navigate to `/pokemon?dex=25`. Same behavior in grid and `?view=timeline`.
3. Add 3+ cards from a few different eras.
4. Click "Collection" in the primary nav. URL becomes `/collection`. All 3 cards visible in grid view. Header shows "3 copies · 3 unique".
5. Click "Timeline" toggle on /collection. Era sections render.
6. Click a card in `/collection` → `/card/:id` opens. "In your collection ✓ — Remove" button is visible. Click it → button changes to "+ Add to collection".
7. Browser back → returns to `/collection`. That card now gone (collection updates live).
8. Reload `/collection` → other 2 cards still persisted.
9. Open devtools → Application → localStorage → `pokemon-tcg-viewer` → `state.owned` is a JSON object with 2 keys. Each value has `card`, `count: 1`, `addedAt`.
10. Migration test: in devtools, edit the localStorage value, change `"version":3` to `"version":2` and delete the `owned` key. Reload → no crash, collection becomes empty (existing api-cache preserved).
11. Toggle disabled state: empty `/collection` → ViewModeToggle is disabled.
12. Click cross-link overlay arrow on a card in `/collection` grid view → navigates to `/?setId=base1` (set page). Confirms `<CollectionToggle>` + `<CrossLinkOverlay>` coexist without click hijack.

If any step fails, debug and fix. If smoke passes, no commit needed.

- [ ] **Step 9.4: Console-clean check**

While the dev server runs, open browser console. Expect:
- No React Router errors.
- No `[holo-card] Unknown rarity` warnings beyond the pre-existing ones (e.g., `Rare Holo Star`).
- No errors from Zustand persist (a successful migration is silent).

- [ ] **Step 9.5: Update spec status**

Edit `docs/superpowers/specs/2026-05-03-phase-3-collection-design.md`. Change:

```markdown
**Status:** Approved (design)
```

to:

```markdown
**Status:** Implemented
```

Commit:

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-collection && git add docs/superpowers/specs/2026-05-03-phase-3-collection-design.md && git commit -m "docs: mark Phase 3 #1 collection spec as implemented"
```

---

## Done criteria

- [ ] All tasks 1–9 above are checked off.
- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` all pass on the worktree.
- [ ] Manual smoke test (Step 9.3) passes — add/remove from grid, timeline, focus view; persistence across reload; migration from v2 to v3.
- [ ] Spec status reads "Implemented".

# Phase 0 — Custom HoloCard Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-03-phase-0-custom-holo-card-design.md](../specs/2026-05-03-phase-0-custom-holo-card-design.md)

**Goal:** Replace the `pokemon-holo-cards` dependency with an internal `<HoloCard />` component that visually matches simey's rarity catalog and exposes API hooks for downstream phases.

**Architecture:** Single React component driven by a non-React pointer-tracking hook that writes CSS custom properties directly to inline style (no `setState` per frame). Rarity strings map to CSS classes via a lookup table with a dev-only warning for unknowns. Foil effects ported from `simeydotme/pokemon-cards-css`.

**Tech Stack:** React 19, TypeScript, Vite 8, Bun (package manager + test runner), Biome (lint/format), happy-dom + @testing-library/react (added in Task 1).

---

## File map

**Create:**
- `bunfig.toml` — Bun test runner config
- `src/test-setup.ts` — happy-dom registration for tests
- `src/components/holo-card/index.ts` — public re-exports
- `src/components/holo-card/types.ts` — `HoloCardData` type
- `src/components/holo-card/rarity.ts` — rarity string → CSS class lookup
- `src/components/holo-card/rarity.test.ts` — pure unit tests for the lookup
- `src/components/holo-card/use-holo-effect.ts` — pointer-tracking hook
- `src/components/holo-card/use-holo-effect.test.tsx` — hook test
- `src/components/holo-card/holo-card.tsx` — the component
- `src/components/holo-card/holo-card.test.tsx` — smoke render tests
- `src/components/holo-card/holo-card.css` — base layout, transform, custom-property defaults
- `src/components/holo-card/rarity-styles.css` — per-rarity foil layers
- `public/holo-textures/CREDITS.md` — attribution
- `public/holo-textures/*.{webp,png,jpg,svg}` — texture assets ported from simey
- `docs/superpowers/specs/fixtures/2026-05-03-phase-0/*.png` — visual baseline screenshots

**Modify:**
- `package.json` — add `happy-dom`, `@happy-dom/global-registrator`, `@testing-library/react`, `@testing-library/dom`; remove `pokemon-holo-cards`
- `src/api.ts` — inline `apiCardToProps` and `HoloCardData` (move from package import to local)
- `src/components/card-grid.tsx` — swap import to local `HoloCard`, drop `id`-stripping workaround
- `src/app.tsx` — drop `CardZoomModal` import and usage

---

## Task 1: Set up React component testing infrastructure

**Files:**
- Create: `bunfig.toml`
- Create: `src/test-setup.ts`
- Create: `src/sanity.test.tsx`
- Modify: `package.json`

- [ ] **Step 1.1: Add testing dev dependencies**

```bash
bun add -d happy-dom @happy-dom/global-registrator @testing-library/react @testing-library/dom
```

(`@types/react` and `@types/react-dom` are already in `devDependencies` — no action needed.)

- [ ] **Step 1.2: Create test setup file**

Create `src/test-setup.ts`:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
```

- [ ] **Step 1.3: Create bunfig.toml to preload the setup file**

Create `bunfig.toml` at the repo root:

```toml
[test]
preload = ["./src/test-setup.ts"]
```

- [ ] **Step 1.4: Write a sanity test that verifies React rendering works**

Create `src/sanity.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";

test("React renders into happy-dom", () => {
	render(<div>hello phase 0</div>);
	expect(screen.getByText("hello phase 0")).toBeDefined();
});
```

- [ ] **Step 1.5: Run the sanity test**

Run: `bun test src/sanity.test.tsx`
Expected: 1 pass, 0 fail.

- [ ] **Step 1.6: Commit**

```bash
git add bunfig.toml src/test-setup.ts src/sanity.test.tsx package.json bun.lock
git commit -m "test: add happy-dom + RTL infrastructure for component tests"
```

---

## Task 2: Create the types module

**Files:**
- Create: `src/components/holo-card/types.ts`

- [ ] **Step 2.1: Create the types file**

Create `src/components/holo-card/types.ts`:

```ts
/**
 * Card data shape consumed by <HoloCard />. Matches the previous external
 * package's HoloCardData so call sites can swap import paths without
 * adjusting their data flow.
 */
export interface HoloCardData {
	id: string;
	imageUrl: string;
	name: string;
	rarity?: string;
	subtypes?: string[];
	supertype?: string;
	setId: string;
	cardNumber: string;
}
```

- [ ] **Step 2.2: Typecheck**

Run: `bun run typecheck`
Expected: zero errors.

- [ ] **Step 2.3: Commit**

```bash
git add src/components/holo-card/types.ts
git commit -m "feat(holo-card): add HoloCardData type"
```

---

## Task 3: Build rarity → CSS class lookup (TDD)

**Files:**
- Create: `src/components/holo-card/rarity.ts`
- Test: `src/components/holo-card/rarity.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `src/components/holo-card/rarity.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { getRarityClass } from "./rarity";

describe("getRarityClass", () => {
	let warnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	test("returns 'no-foil' when rarity is undefined", () => {
		expect(getRarityClass(undefined)).toBe("no-foil");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("maps known rarities to their CSS class", () => {
		expect(getRarityClass("Rare Holo")).toBe("holo-basic");
		expect(getRarityClass("Rare Holo VMAX")).toBe("holo-vmax");
		expect(getRarityClass("Reverse Holo")).toBe("reverse-holo");
		expect(getRarityClass("Radiant Rare")).toBe("radiant");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("falls back to 'holo-basic' and warns for unknown rarities", () => {
		expect(getRarityClass("Some Future Mythic Tier")).toBe("holo-basic");
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy.mock.calls[0][0]).toContain("Some Future Mythic Tier");
	});

	test("returns 'no-foil' for plain Common/Uncommon (no foil expected)", () => {
		expect(getRarityClass("Common")).toBe("no-foil");
		expect(getRarityClass("Uncommon")).toBe("no-foil");
		expect(getRarityClass("Rare")).toBe("no-foil");
		expect(warnSpy).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 3.2: Run the test to verify it fails**

Run: `bun test src/components/holo-card/rarity.test.ts`
Expected: FAIL with "Cannot find module './rarity'" or similar.

- [ ] **Step 3.3: Implement `rarity.ts`**

Create `src/components/holo-card/rarity.ts`:

```ts
/**
 * pokemontcg.io rarity strings → our internal CSS class. Keep the keys
 * verbatim from the API; treat the value as a stable identifier referenced
 * in rarity-styles.css.
 *
 * Plain Common / Uncommon / Rare have no foil — they map to "no-foil"
 * explicitly so they don't hit the warn-and-fallback path.
 */
const RARITY_CLASS = {
	Common: "no-foil",
	Uncommon: "no-foil",
	Rare: "no-foil",

	"Rare Holo": "holo-basic",
	"Rare Holo EX": "holo-basic",
	"Rare Holo GX": "holo-basic",
	"Rare Holo LV.X": "holo-basic",
	"Rare Holo V": "holo-v",
	"Rare Holo VMAX": "holo-vmax",
	"Rare Holo VSTAR": "holo-vstar",
	"Rare BREAK": "holo-basic",
	"Rare Prime": "holo-basic",
	"Rare ACE": "holo-basic",
	"Rare Shiny": "holo-basic",
	"Rare Shiny GX": "holo-basic",

	"Reverse Holo": "reverse-holo",
	"Amazing Rare": "amazing",
	"Radiant Rare": "radiant",
	"Trainer Gallery Rare Holo": "trainer-gallery",

	"Rare Rainbow": "rainbow",
	"Rare Secret": "gold-secret",
	"Rare Ultra": "ultra",
	"Rare Shining": "shining",

	"Hyper Rare": "rainbow",
	"Illustration Rare": "trainer-gallery",
	"Special Illustration Rare": "trainer-gallery",
	"Ultra Rare": "ultra",
	"Double Rare": "holo-basic",
	"Promo": "holo-basic",
	"LEGEND": "holo-basic",
	"Classic Collection": "holo-basic",
} as const;

export function getRarityClass(rarity?: string): string {
	if (!rarity) return "no-foil";
	const cls = RARITY_CLASS[rarity as keyof typeof RARITY_CLASS];
	if (cls) return cls;
	if (import.meta.env.DEV) {
		console.warn(
			`[holo-card] Unknown rarity "${rarity}" — using generic holo fallback`,
		);
	}
	return "holo-basic";
}
```

- [ ] **Step 3.4: Run the test to verify it passes**

Run: `bun test src/components/holo-card/rarity.test.ts`
Expected: 4 pass, 0 fail.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/holo-card/rarity.ts src/components/holo-card/rarity.test.ts
git commit -m "feat(holo-card): add rarity → CSS class lookup with dev warning fallback"
```

---

## Task 4: Build the useHoloEffect hook

**Files:**
- Create: `src/components/holo-card/use-holo-effect.ts`
- Test: `src/components/holo-card/use-holo-effect.test.tsx`

- [ ] **Step 4.1: Write the failing test**

Create `src/components/holo-card/use-holo-effect.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { expect, test } from "bun:test";
import { useHoloEffect } from "./use-holo-effect";

function Probe() {
	const { ref } = useHoloEffect();
	return <div ref={ref} data-testid="card" />;
}

test("hook attaches default custom properties on mount", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;
	expect(el.style.getPropertyValue("--pointer-x")).toBe("50");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("50");
	expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
	expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
});

test("pointermove updates --pointer-x / --pointer-y based on rect-relative position", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;

	// Stub getBoundingClientRect: 100x200 element at origin.
	el.getBoundingClientRect = () =>
		({
			left: 0,
			top: 0,
			width: 100,
			height: 200,
			right: 100,
			bottom: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}) as DOMRect;

	el.dispatchEvent(
		new PointerEvent("pointermove", { clientX: 75, clientY: 100, bubbles: true }),
	);

	expect(el.style.getPropertyValue("--pointer-x")).toBe("75");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("50");
});

test("pointerleave resets pointer position to center", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;
	el.getBoundingClientRect = () =>
		({
			left: 0,
			top: 0,
			width: 100,
			height: 100,
			right: 100,
			bottom: 100,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}) as DOMRect;

	el.dispatchEvent(
		new PointerEvent("pointermove", { clientX: 90, clientY: 90, bubbles: true }),
	);
	el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));

	expect(el.style.getPropertyValue("--pointer-x")).toBe("50");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("50");
	expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
	expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
});
```

- [ ] **Step 4.2: Run the test to verify it fails**

Run: `bun test src/components/holo-card/use-holo-effect.test.tsx`
Expected: FAIL with "Cannot find module './use-holo-effect'".

- [ ] **Step 4.3: Implement the hook**

Create `src/components/holo-card/use-holo-effect.ts`:

```ts
import { useEffect, useRef } from "react";

const DEFAULT_POINTER = 50;
const TILT_DIVISOR = 3.5;

function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}

function setVars(el: HTMLElement, pointerX: number, pointerY: number) {
	const px = clamp(pointerX, 0, 100);
	const py = clamp(pointerY, 0, 100);
	const centerX = px - 50;
	const centerY = py - 50;
	const fromCenter = clamp(
		Math.sqrt(centerX * centerX + centerY * centerY) / 50,
		0,
		1,
	);

	el.style.setProperty("--pointer-x", `${px}`);
	el.style.setProperty("--pointer-y", `${py}`);
	el.style.setProperty("--pointer-from-center", `${fromCenter}`);
	el.style.setProperty("--rotate-x", `${-(centerY / TILT_DIVISOR)}deg`);
	el.style.setProperty("--rotate-y", `${centerX / TILT_DIVISOR}deg`);
}

/**
 * Pointer-tracking hook for the holo card. Writes CSS custom properties
 * directly to the element's inline style — never calls setState — so
 * pointer motion never triggers a React render. Critical for the
 * virtualized grid which mounts dozens of cards simultaneously.
 */
export function useHoloEffect() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		// Apply default centered values on mount so unhovered cards are not
		// visually broken (e.g. inheriting NaN-derived gradients from CSS).
		setVars(el, DEFAULT_POINTER, DEFAULT_POINTER);

		function onMove(e: PointerEvent) {
			if (!el) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;
			const px = ((e.clientX - rect.left) / rect.width) * 100;
			const py = ((e.clientY - rect.top) / rect.height) * 100;
			setVars(el, px, py);
		}

		function onLeave() {
			if (!el) return;
			setVars(el, DEFAULT_POINTER, DEFAULT_POINTER);
		}

		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerleave", onLeave);
		return () => {
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerleave", onLeave);
		};
	}, []);

	return { ref };
}
```

- [ ] **Step 4.4: Run the test to verify it passes**

Run: `bun test src/components/holo-card/use-holo-effect.test.tsx`
Expected: 3 pass, 0 fail.

- [ ] **Step 4.5: Commit**

```bash
git add src/components/holo-card/use-holo-effect.ts src/components/holo-card/use-holo-effect.test.tsx
git commit -m "feat(holo-card): add useHoloEffect pointer-to-CSS-vars hook"
```

---

## Task 5: Write base CSS (holo-card.css)

**Files:**
- Create: `src/components/holo-card/holo-card.css`

- [ ] **Step 5.1: Write the base CSS**

Create `src/components/holo-card/holo-card.css`:

```css
/*
 * Base styles for <HoloCard />. Defines the 3D frame, pointer-driven
 * custom properties (with safe defaults), and size variants. Per-rarity
 * foil decoration lives in rarity-styles.css.
 */

.holo-card {
	/* Pointer-driven properties. Defaults so static (server-rendered or
	   pre-effect-mount) state still looks reasonable. Overwritten by
	   useHoloEffect on mount. */
	--pointer-x: 50;
	--pointer-y: 50;
	--pointer-from-center: 0;
	--rotate-x: 0deg;
	--rotate-y: 0deg;

	position: relative;
	display: block;
	width: 100%;
	aspect-ratio: 245 / 342; /* standard Pokémon card aspect */
	border-radius: 4.55% / 3.5%;
	background: #111;
	overflow: hidden;
	transform-style: preserve-3d;
	transform: perspective(800px) rotateX(var(--rotate-x))
		rotateY(var(--rotate-y));
	transition: transform 0.15s ease-out;
	cursor: pointer;
	user-select: none;
	-webkit-tap-highlight-color: transparent;
}

.holo-card.size-grid {
	max-width: 300px;
}

.holo-card.size-focus {
	max-width: 600px;
}

.holo-card-image {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
	pointer-events: none;
	z-index: 1;
}

.holo-card-overlay {
	position: absolute;
	inset: 0;
	z-index: 3;
	pointer-events: none;
	opacity: 0;
	transition: opacity 0.15s ease-out;
	display: flex;
	align-items: flex-start;
	justify-content: flex-end;
	padding: 0.5rem;
}

.holo-card:hover .holo-card-overlay,
.holo-card:focus-within .holo-card-overlay {
	opacity: 1;
}

/* Re-enable pointer events on overlay children (buttons, links). */
.holo-card-overlay > * {
	pointer-events: auto;
}
```

- [ ] **Step 5.2: Commit**

```bash
git add src/components/holo-card/holo-card.css
git commit -m "feat(holo-card): add base CSS with size variants and overlay slot"
```

---

## Task 6: Build HoloCard component shell + smoke tests

**Files:**
- Create: `src/components/holo-card/holo-card.tsx`
- Create: `src/components/holo-card/index.ts`
- Test: `src/components/holo-card/holo-card.test.tsx`

- [ ] **Step 6.1: Write the failing tests**

Create `src/components/holo-card/holo-card.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { HoloCard } from "./holo-card";

const baseProps = {
	imageUrl: "https://example.invalid/charizard.png",
	name: "Charizard",
	setId: "base1",
	cardNumber: "4",
};

describe("<HoloCard />", () => {
	let warnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		warnSpy.mockRestore();
	});

	test("renders the card image with name as alt text", () => {
		render(<HoloCard {...baseProps} />);
		const img = screen.getByAltText("Charizard") as HTMLImageElement;
		expect(img.src).toBe("https://example.invalid/charizard.png");
	});

	test("applies known rarity class without warning", () => {
		const { container } = render(
			<HoloCard {...baseProps} rarity="Rare Holo VMAX" />,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("holo-vmax")).toBe(true);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("applies generic holo class and warns for unknown rarity", () => {
		const { container } = render(
			<HoloCard {...baseProps} rarity="Mythic Cosmic Tier" />,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("holo-basic")).toBe(true);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	test("applies no-foil class when rarity is missing", () => {
		const { container } = render(<HoloCard {...baseProps} />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("no-foil")).toBe(true);
	});

	test("calls onClick when the card is clicked", () => {
		let clicks = 0;
		render(<HoloCard {...baseProps} onClick={() => clicks++} />);
		fireEvent.click(screen.getByRole("button"));
		expect(clicks).toBe(1);
	});

	test("renders hoverOverlay content into the overlay slot", () => {
		render(
			<HoloCard
				{...baseProps}
				hoverOverlay={<button type="button">Action</button>}
			/>,
		);
		expect(screen.getByText("Action")).toBeDefined();
	});

	test("applies size variant class", () => {
		const { container } = render(<HoloCard {...baseProps} size="focus" />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("size-focus")).toBe(true);
	});

	test("default size is 'grid'", () => {
		const { container } = render(<HoloCard {...baseProps} />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("size-grid")).toBe(true);
	});
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `bun test src/components/holo-card/holo-card.test.tsx`
Expected: FAIL with "Cannot find module './holo-card'".

- [ ] **Step 6.3: Implement the component**

Create `src/components/holo-card/holo-card.tsx`:

```tsx
import type React from "react";
import "./holo-card.css";
import "./rarity-styles.css";
import { getRarityClass } from "./rarity";
import { useHoloEffect } from "./use-holo-effect";

export interface HoloCardProps {
	imageUrl: string;
	name: string;
	rarity?: string;
	subtypes?: string[];
	supertype?: string;
	setId?: string;
	cardNumber?: string;

	onClick?: (e: React.MouseEvent | React.KeyboardEvent) => void;
	hoverOverlay?: React.ReactNode;
	size?: "grid" | "focus";

	className?: string;
	style?: React.CSSProperties;
}

export function HoloCard({
	imageUrl,
	name,
	rarity,
	onClick,
	hoverOverlay,
	size = "grid",
	className,
	style,
}: HoloCardProps) {
	const { ref } = useHoloEffect();
	const rarityClass = getRarityClass(rarity);

	const classes = [
		"holo-card",
		`size-${size}`,
		rarityClass,
		className,
	]
		.filter(Boolean)
		.join(" ");

	function handleKeyDown(e: React.KeyboardEvent) {
		if (!onClick) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick(e);
		}
	}

	return (
		<div
			ref={ref}
			className={classes}
			style={style}
			role="button"
			tabIndex={onClick ? 0 : -1}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			aria-label={name}
		>
			<img className="holo-card-image" src={imageUrl} alt={name} />
			<div className="holo-card-overlay">{hoverOverlay}</div>
		</div>
	);
}
```

- [ ] **Step 6.4: Create an empty rarity-styles.css so the import resolves**

Create `src/components/holo-card/rarity-styles.css`:

```css
/* Per-rarity foil layers. Populated by Task 7 (port from simey). */
```

- [ ] **Step 6.5: Create the index module**

Create `src/components/holo-card/index.ts`:

```ts
export { HoloCard, type HoloCardProps } from "./holo-card";
export type { HoloCardData } from "./types";
```

- [ ] **Step 6.6: Run tests to verify they pass**

Run: `bun test src/components/holo-card/`
Expected: 8 pass for holo-card.test.tsx, plus prior passes from rarity + use-holo-effect tests.

- [ ] **Step 6.7: Run typecheck**

Run: `bun run typecheck`
Expected: zero errors.

- [ ] **Step 6.8: Commit**

```bash
git add src/components/holo-card/holo-card.tsx src/components/holo-card/holo-card.test.tsx src/components/holo-card/rarity-styles.css src/components/holo-card/index.ts
git commit -m "feat(holo-card): add HoloCard component with overlay slot and size variants"
```

---

## Task 7: Port simey's rarity styles to rarity-styles.css

**Files:**
- Modify: `src/components/holo-card/rarity-styles.css`

This task ports CSS from `simeydotme/pokemon-cards-css`. The work is mechanical translation, not invention.

- [ ] **Step 7.1: Fetch simey's CSS files inventory**

```bash
gh api repos/simeydotme/pokemon-cards-css/contents/public/css --jq '.[].name'
```

Note the file list — these are simey's per-rarity CSS files (typically `basic.css`, `holo.css`, `regular-holo.css`, `reverse-holo.css`, `cosmos.css`, `radiant.css`, `vmax.css`, `vstar.css`, `rainbow.css`, `gold.css`, `trainer-gallery.css`, etc.).

- [ ] **Step 7.2: Pull simey's main effect CSS files locally for reference**

```bash
mkdir -p /tmp/simey-css
for file in $(gh api repos/simeydotme/pokemon-cards-css/contents/public/css --jq '.[] | select(.type=="file") | .name'); do
  gh api repos/simeydotme/pokemon-cards-css/contents/public/css/"$file" --jq '.content' | base64 -d > /tmp/simey-css/"$file"
done
ls -la /tmp/simey-css/
```

Expected: a list of `.css` files saved locally for reference.

- [ ] **Step 7.3: Translate simey's selectors to our class scheme**

Read each file in `/tmp/simey-css/` and append the corresponding CSS to `src/components/holo-card/rarity-styles.css`. Translation rules:

- simey's selectors look like `.card.basic.rare-holo` (compound classes). Replace with our flat class names: `.holo-card.holo-basic`, `.holo-card.holo-vmax`, etc.
- simey's foil/mask layers use `::before`/`::after` on `.card__shine`/`.card__glare` etc. We don't have those sub-elements; instead apply layers to `::before` and `::after` on the `.holo-card` root, OR add nested elements in the component if a rarity needs more than two layers.
- If a rarity needs more than two stacked layers, extend `holo-card.tsx` to render extra `<div className="holo-card-foil-layer-N" aria-hidden="true">` elements. Keep them above `.holo-card-image` (z-index 2) but below `.holo-card-overlay` (z-index 3). Note this in the commit message.
- All variable references (`var(--pointer-x)`, etc.) carry over unchanged — our hook writes the same property names simey uses.

The full enumerated rarity classes referenced from `rarity.ts` that need style rules:

| Class                | Source file (simey)                       |
|----------------------|-------------------------------------------|
| `no-foil`            | none — class is no-op (transparent)       |
| `holo-basic`         | `regular-holo.css` / `basic-holo.css`     |
| `holo-v`             | `v.css` (or per simey's organization)     |
| `holo-vmax`          | `vmax.css`                                |
| `holo-vstar`         | `vstar.css`                               |
| `reverse-holo`       | `reverse-holo.css`                        |
| `radiant`            | `radiant.css`                             |
| `rainbow`            | `rainbow.css`                             |
| `gold-secret`        | `gold.css` / `secret.css`                 |
| `trainer-gallery`    | `trainer-gallery.css`                     |
| `amazing`            | `amazing.css` (if present)                |
| `ultra`              | (use rainbow.css as visual stand-in)      |
| `shining`            | (use cosmos/holo as stand-in)             |

If a CSS file doesn't exist for a class above, leave a `/* TODO: source pending */` block referencing the closest visual analogue and pick it up in a follow-up. Do **not** ship empty rules for these — they should at minimum include the generic holo-basic effect so the card has visible foil.

- [ ] **Step 7.4: Update texture URLs**

simey's CSS references textures at paths like `/img/galaxy-foil.png`. Update each `url(...)` reference to `/pokemon-tcg-viewer/holo-textures/<filename>` (note the `/pokemon-tcg-viewer/` prefix matches the Vite `base` config in `vite.config.ts`). Texture files themselves come in Task 8.

- [ ] **Step 7.5: Test that the file at least parses**

Run: `bun run build`
Expected: build succeeds. CSS is treated as static text by Vite — syntax errors will surface here.

- [ ] **Step 7.6: Commit**

```bash
git add src/components/holo-card/rarity-styles.css src/components/holo-card/holo-card.tsx
git commit -m "feat(holo-card): port rarity styles from simey/pokemon-cards-css

Translates simey's compound selectors (.card.basic.rare-holo) to our flat
class scheme. Texture URLs point at /pokemon-tcg-viewer/holo-textures/
which Task 8 populates.

Reference: https://github.com/simeydotme/pokemon-cards-css"
```

---

## Task 8: Port foil texture assets

**Files:**
- Create: `public/holo-textures/CREDITS.md`
- Create: `public/holo-textures/<various>.{webp,png,jpg}`

- [ ] **Step 8.1: List simey's image assets**

```bash
gh api repos/simeydotme/pokemon-cards-css/contents/public/img --jq '.[] | select(.type=="file") | .name'
```

Note the file list. Identify which assets are referenced by URL in your `rarity-styles.css` (from Task 7).

- [ ] **Step 8.2: Download referenced textures**

```bash
mkdir -p /Users/rin/GitHub/pokemon-tcg-viewer/public/holo-textures
for file in <list-from-step-8.1-that-rarity-styles-references>; do
  gh api repos/simeydotme/pokemon-cards-css/contents/public/img/"$file" --jq '.content' | base64 -d > /Users/rin/GitHub/pokemon-tcg-viewer/public/holo-textures/"$file"
done
ls -lah /Users/rin/GitHub/pokemon-tcg-viewer/public/holo-textures/
```

- [ ] **Step 8.3: Check texture sizes**

```bash
du -h /Users/rin/GitHub/pokemon-tcg-viewer/public/holo-textures/* | sort -h
```

Expected: each file under ~500 KB. If any texture is over ~200 KB and isn't visually load-bearing, replace its CSS reference in `rarity-styles.css` with a CSS gradient approximation and remove the file. Per spec risk note.

- [ ] **Step 8.4: Write attribution credits**

Create `public/holo-textures/CREDITS.md`:

```md
# Holo Texture Credits

Textures in this folder are sourced from
[`simeydotme/pokemon-cards-css`](https://github.com/simeydotme/pokemon-cards-css)
which itself credits:

- Galaxy Holo from [aschefield101](https://www.deviantart.com/aschefield101/art/HoloSheet-2012-313543843)
- Some backgrounds from [Vecteezy](https://www.vecteezy.com/free-photos)

This project (`pokemon-tcg-viewer`) is non-commercial and released under
the same MIT-spirited terms as the upstream repo.
```

- [ ] **Step 8.5: Verify the dev server can serve the assets**

```bash
bun run dev &
DEV_PID=$!
sleep 3
curl -sI http://localhost:5173/pokemon-tcg-viewer/holo-textures/CREDITS.md | head -1
kill $DEV_PID
```

Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 8.6: Commit**

```bash
git add public/holo-textures/
git commit -m "feat(holo-card): add foil texture assets ported from simey/pokemon-cards-css"
```

---

## Task 9: Inline `apiCardToProps` and `HoloCardData` into api.ts

**Files:**
- Modify: `src/api.ts`

The package's `apiCardToProps` is a trivial mapping. Inlining it next to the API response shape consolidates one source of truth.

- [ ] **Step 9.1: Read the current api.ts**

Run: `cat src/api.ts`
Note the existing imports from `pokemon-holo-cards` and the function signatures using `HoloCardData` and `PokemonApiCard`.

- [ ] **Step 9.2: Replace package imports with local code**

Modify `src/api.ts` — replace lines 1-5:

```ts
import type { HoloCardData } from "./components/holo-card";

interface PokemonApiCard {
	id: string;
	name: string;
	supertype: string;
	subtypes?: string[];
	rarity?: string;
	number: string;
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
		cardNumber: card.number,
	};
}
```

The rest of the file (functions `getSets`, `getCardsByQuery`, `getCardsBySet`, `getCardsByPokedexNumber`) stays unchanged — they already use `apiCardToProps` and `HoloCardData` by name.

- [ ] **Step 9.3: Typecheck**

Run: `bun run typecheck`
Expected: zero errors. (`HoloCardData` now resolves to the local module.)

- [ ] **Step 9.4: Commit**

```bash
git add src/api.ts
git commit -m "refactor(api): inline apiCardToProps + HoloCardData (drop pokemon-holo-cards import)"
```

---

## Task 10: Migrate card-grid.tsx and drop CardZoomModal

**Files:**
- Modify: `src/components/card-grid.tsx`
- Modify: `src/app.tsx`

- [ ] **Step 10.1: Update card-grid.tsx import and remove `id`-stripping**

Read [src/components/card-grid.tsx](src/components/card-grid.tsx). Replace the line:

```tsx
import { HoloCard, type HoloCardData } from "pokemon-holo-cards";
```

with:

```tsx
import { HoloCard, type HoloCardData } from "./holo-card";
```

Then update the `itemContent` callback to remove the `id`-stripping comment + destructure (since our local component never auto-fetches by `id`):

```tsx
itemContent={(_, card) => (
	<HoloCard
		imageUrl={card.imageUrl}
		name={card.name}
		rarity={card.rarity}
		subtypes={card.subtypes}
		supertype={card.supertype}
		setId={card.setId}
		cardNumber={card.cardNumber}
		style={{ width: 300 }}
	/>
)}
```

(Spread is no longer needed — and avoiding it makes the prop surface explicit.)

- [ ] **Step 10.2: Drop CardZoomModal from app.tsx**

Read [src/app.tsx](src/app.tsx). Remove:

1. Line 1: `import { CardZoomModal } from "pokemon-holo-cards";`
2. Line 10: `<CardZoomModal />`

The new top of `app.tsx`:

```tsx
import { NavLink, Route, Routes } from "react-router";
import "./app.css";
import { PokemonPage } from "./pages/pokemon-page";
import { SetsPage } from "./pages/sets-page";

export default function App() {
	return (
		<div className="app">
			<nav className="primary-nav" aria-label="Filter mode">
```

- [ ] **Step 10.3: Confirm no other consumer references the package**

Run: `grep -r "pokemon-holo-cards" src/ --include="*.ts" --include="*.tsx"`
Expected: no output.

- [ ] **Step 10.4: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both pass.

- [ ] **Step 10.5: Commit**

```bash
git add src/components/card-grid.tsx src/app.tsx
git commit -m "refactor: swap card-grid to local HoloCard, drop CardZoomModal"
```

---

## Task 11: Remove `pokemon-holo-cards` dependency

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`

- [ ] **Step 11.1: Remove the dependency**

```bash
bun remove pokemon-holo-cards
```

Expected: package removed from `package.json`, `bun.lock` updated, `node_modules/pokemon-holo-cards/` gone.

- [ ] **Step 11.2: Confirm clean state**

Run: `grep -r "pokemon-holo-cards" . --include="*.ts" --include="*.tsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git`
Expected: no output.

- [ ] **Step 11.3: Typecheck and full build**

Run: `bun run typecheck && bun run build`
Expected: both succeed.

- [ ] **Step 11.4: Commit**

```bash
git add package.json bun.lock
git commit -m "deps: remove pokemon-holo-cards (replaced by internal HoloCard)"
```

---

## Task 12: Capture visual baseline screenshots

**Files:**
- Create: `docs/superpowers/specs/fixtures/2026-05-03-phase-0/*.png`

These screenshots become the project's documented visual baseline. Future visual regressions compare against them.

- [ ] **Step 12.1: Start the dev server**

```bash
bun run dev
```

(Run in a terminal; it'll listen on `http://localhost:5173/pokemon-tcg-viewer/`.)

- [ ] **Step 12.2: Capture five representative cards**

In a browser, navigate the dev server and capture cropped screenshots (just the card, with hover/holo effect visible) of one card from each rarity tier. Save them under the fixtures folder using these exact names:

```
docs/superpowers/specs/fixtures/2026-05-03-phase-0/
├── common.png        (any non-foil card, e.g. a Common-rarity Pidgey)
├── rare-holo.png     (a "Rare Holo" card with classic holo effect)
├── rare-holo-vmax.png (any VMAX card)
├── reverse-holo.png  (any reverse-holo printing)
└── rare-secret.png   (a gold-bordered secret-rare card)
```

For each: open the card in the grid, hover so the holo effect is mid-shine, take a screenshot covering at least the card image. Manual capture is fine — these are documentation, not automated regressions.

- [ ] **Step 12.3: Verify each renders plausibly**

Eyeball each screenshot:
- No broken/missing images
- Foil layers visible (where expected)
- Card image not overlaid by stray pseudo-elements
- Aspect ratio correct (245:342 standard card ratio)

If a card looks broken, file a follow-up issue and note it in the commit message — don't block this task on minor visual drift, but do call out anything obviously broken.

- [ ] **Step 12.4: Commit**

```bash
git add docs/superpowers/specs/fixtures/2026-05-03-phase-0/
git commit -m "docs: capture visual baseline for Phase 0 holo card migration"
```

---

## Task 13: Run all verification checks

**Files:** none (read-only verification)

- [ ] **Step 13.1: Lint**

Run: `bun run lint`
Expected: no errors.

- [ ] **Step 13.2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 13.3: Test**

Run: `bun test`
Expected: all suites pass — sanity, rarity, use-holo-effect, holo-card. Total around 16+ assertions across 4 files.

- [ ] **Step 13.4: Build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 13.5: Bundle size sanity**

Inspect the size summary printed by Vite (chunks ending in `.js`). Compare against the pre-Phase-0 build (committed at `0cf36a5` — `git stash` your working tree, `git checkout 0cf36a5 -- .`, `bun install`, `bun run build`, note totals, then restore).

A simpler version: just record the post-migration totals — the spec's threshold is "shouldn't grow more than ~10 KB gzipped from this change", so visual comparison against a known prior is the check. If you suspect bloat, run the comparison; if totals look reasonable (within ~50 KB of the prior bundle), accept and proceed.

- [ ] **Step 13.6: Console-clean check**

Start `bun run dev`. Open browser dev console. Browse a recent set (e.g. "Crown Zenith" / "Surging Sparks" / any Sword & Shield era set). Scroll the entire grid. Confirm zero `[holo-card] Unknown rarity` warnings.

If a warning fires for a rarity that should be supported, add the rarity string to the map in `src/components/holo-card/rarity.ts` and pick the closest visual class, then commit a fix: `git commit -am "fix(holo-card): add <rarity> to known rarity map"`.

- [ ] **Step 13.7: Cross-browser smoke**

Open the dev server in Chrome, Safari, and Firefox. For each, browse one set, hover over 5+ cards across different rarities, confirm:
- Holo effects render (foils visible, no completely flat cards on rarities that should foil)
- No CSS stacking-context bugs (overlay slot doesn't drop behind the image, foil doesn't overlay overlay-slot buttons)
- 3D tilt responds to pointer movement

Safari is the highest-risk target due to `mix-blend-mode` quirks (per spec risk).

- [ ] **Step 13.8: Final commit if any fixes were needed**

If steps 13.6 or 13.7 surfaced fixes that need committing, commit each fix individually with `fix(holo-card): ...` messages. If no fixes were needed, skip this step.

- [ ] **Step 13.9: Update the spec status to reflect completion**

Modify the spec's frontmatter line: replace `**Status:** Approved (design)` with `**Status:** Implemented`. Commit:

```bash
git add docs/superpowers/specs/2026-05-03-phase-0-custom-holo-card-design.md
git commit -m "docs: mark Phase 0 spec as implemented"
```

---

## Done criteria

The plan is complete when:

- [ ] All Phase 0 tasks (1–13) above are checked off.
- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` all pass on the working tree.
- [ ] `grep -r "pokemon-holo-cards" .` returns nothing outside `node_modules` and `.git` history.
- [ ] Visual baseline fixtures exist and were eyeballed.
- [ ] Spec status line reads "Implemented".

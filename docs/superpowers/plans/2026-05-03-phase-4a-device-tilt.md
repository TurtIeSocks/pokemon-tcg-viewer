# Phase 4a — Device Tilt for HoloCard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Spec:** [docs/superpowers/specs/2026-05-03-phase-4a-device-tilt-design.md](../specs/2026-05-03-phase-4a-device-tilt-design.md)

**Goal:** On `/card/:id`, surface a "Tilt to shine" button that subscribes to `DeviceOrientationEvent` and drives the same holo CSS vars the mouse currently writes.

**Architecture:** Extract `setVars` from `use-holo-effect.ts` into a shared `holo-vars.ts`. Add a pure `computeTiltVars()` helper (testable) plus a `useTiltEffect({ ref, enabled })` hook that subscribes window orientation events, calibrates on first reading, calls `setHoloVars()` on subsequent. `<HoloCard>` accepts an optional `tilt?: boolean` prop and runs the tilt hook against its existing ref. `card-page.tsx` owns the enable button + iOS permission flow.

**Tech Stack:** React 19, TypeScript, Vite 8, Bun (package + test), Biome, happy-dom + @testing-library/react.

---

## File map

**Create:**
- `src/components/holo-card/holo-vars.ts` — shared `setHoloVars` + `clamp` + constants
- `src/components/holo-card/holo-vars.test.ts` — pure math tests
- `src/components/holo-card/use-tilt-effect.ts` — hook + `computeTiltVars` pure helper
- `src/components/holo-card/use-tilt-effect.test.ts` — pure mapping tests

**Modify:**
- `src/components/holo-card/use-holo-effect.ts` — import `setHoloVars` from shared module
- `src/components/holo-card/holo-card.tsx` — accept `tilt?: boolean`, call `useTiltEffect`
- `src/pages/card-page.tsx` — add tilt state, permission helper, button, pass `tilt` to HoloCard
- `src/pages/card-page.css` — `.card-page-tilt-button` styles

---

## Task 1: Extract `setVars` + `clamp` to shared `holo-vars.ts` (TDD)

**Files:**
- Create: `src/components/holo-card/holo-vars.ts`
- Create: `src/components/holo-card/holo-vars.test.ts`
- Modify: `src/components/holo-card/use-holo-effect.ts`

Pure refactor + test the extraction. Behavior must remain identical.

- [ ] **Step 1.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && pwd && git branch --show-current
```
Expected: worktree path + `phase-4/tilt`. STOP and report BLOCKED otherwise.

- [ ] **Step 1.2: Write the failing test**

Create `src/components/holo-card/holo-vars.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { clamp, DEFAULT_POINTER, setHoloVars } from "./holo-vars";

describe("clamp", () => {
	test("returns input when within range", () => {
		expect(clamp(50, 0, 100)).toBe(50);
	});

	test("saturates at min when below", () => {
		expect(clamp(-5, 0, 100)).toBe(0);
	});

	test("saturates at max when above", () => {
		expect(clamp(120, 0, 100)).toBe(100);
	});
});

describe("setHoloVars", () => {
	test("writes all 9 CSS custom properties when called with centered pointer", () => {
		const el = document.createElement("div");
		setHoloVars(el, DEFAULT_POINTER, DEFAULT_POINTER);
		expect(el.style.getPropertyValue("--pointer-x")).toBe("50");
		expect(el.style.getPropertyValue("--pointer-y")).toBe("50");
		expect(el.style.getPropertyValue("--pointer-from-center")).toBe("0");
		expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
		expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
		expect(el.style.getPropertyValue("--background-x")).toBe("50%");
		expect(el.style.getPropertyValue("--background-y")).toBe("50%");
		expect(el.style.getPropertyValue("--pointer-from-left")).toBe("0.5");
		expect(el.style.getPropertyValue("--pointer-from-top")).toBe("0.5");
	});

	test("clamps out-of-range pointer inputs before writing", () => {
		const el = document.createElement("div");
		setHoloVars(el, 200, -50);
		expect(el.style.getPropertyValue("--pointer-x")).toBe("100");
		expect(el.style.getPropertyValue("--pointer-y")).toBe("0");
	});
});
```

- [ ] **Step 1.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && bun test src/components/holo-card/holo-vars.test.ts
```
Expected: FAIL with "Cannot find module './holo-vars'".

- [ ] **Step 1.4: Create `src/components/holo-card/holo-vars.ts`**

Copy the existing constants + function bodies from `use-holo-effect.ts` verbatim, renaming `setVars` → `setHoloVars`:

```ts
export const DEFAULT_POINTER = 50;
export const TILT_DIVISOR = 3.5;

export function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

export function setHoloVars(
	el: HTMLElement,
	pointerX: number,
	pointerY: number,
): void {
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
	el.style.setProperty("--background-x", `${50 + (px - 50) * -0.5}%`);
	el.style.setProperty("--background-y", `${50 + (py - 50) * -0.5}%`);
	el.style.setProperty("--pointer-from-left", `${px / 100}`);
	el.style.setProperty("--pointer-from-top", `${py / 100}`);
}
```

- [ ] **Step 1.5: Run tests pass**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && bun test src/components/holo-card/holo-vars.test.ts
```
Expected: 5 pass.

- [ ] **Step 1.6: Refactor `use-holo-effect.ts` to import from shared module**

Replace the contents of `src/components/holo-card/use-holo-effect.ts` with:

```ts
import { useEffect, useRef } from "react";
import { DEFAULT_POINTER, setHoloVars } from "./holo-vars";

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
		setHoloVars(el, DEFAULT_POINTER, DEFAULT_POINTER);

		// Inner null guards are required for TypeScript narrowing into the inner
		// function scope, even though `el` is a const captured after a non-null
		// outer check. Without these, `tsc -b` reports TS18047 / TS2345.
		function onMove(e: PointerEvent) {
			if (!el) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;
			const px = ((e.clientX - rect.left) / rect.width) * 100;
			const py = ((e.clientY - rect.top) / rect.height) * 100;
			setHoloVars(el, px, py);
		}

		function onLeave() {
			if (!el) return;
			setHoloVars(el, DEFAULT_POINTER, DEFAULT_POINTER);
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

- [ ] **Step 1.7: Verify full suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && bun run typecheck && bun run lint && bun test
```
Expected: 123 total pass (118 baseline + 5 new). Typecheck clean. Lint shows only the pre-existing `card-grid.css !important` warning.

- [ ] **Step 1.8: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && git add src/components/holo-card/holo-vars.ts src/components/holo-card/holo-vars.test.ts src/components/holo-card/use-holo-effect.ts && git commit -m "refactor(holo-card): extract setVars to shared holo-vars module

Renamed to setHoloVars + exported alongside clamp + DEFAULT_POINTER.
Pure refactor — useHoloEffect now imports from holo-vars. 5 unit tests
on the shared math. Sets up Phase 4a tilt hook to write to the same
CSS vars without code duplication."
```

---

## Task 2: `computeTiltVars` pure helper + `useTiltEffect` hook (TDD)

**Files:**
- Create: `src/components/holo-card/use-tilt-effect.ts`
- Create: `src/components/holo-card/use-tilt-effect.test.ts`

The pure mapping function is fully testable; the hook side effect is verified manually in the smoke test (happy-dom doesn't fire `deviceorientation`).

- [ ] **Step 2.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && pwd && git branch --show-current
```

- [ ] **Step 2.2: Write the failing test**

Create `src/components/holo-card/use-tilt-effect.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { computeTiltVars, TILT_MAX_DEG } from "./use-tilt-effect";

describe("computeTiltVars", () => {
	test("returns centered (50, 50) when reading equals neutral", () => {
		const { pointerX, pointerY } = computeTiltVars({
			beta: 30,
			gamma: 10,
			betaNeutral: 30,
			gammaNeutral: 10,
		});
		expect(pointerX).toBe(50);
		expect(pointerY).toBe(50);
	});

	test("returns 100 on each axis when delta saturates at +TILT_MAX_DEG", () => {
		const { pointerX, pointerY } = computeTiltVars({
			beta: 0 + TILT_MAX_DEG + 5,
			gamma: 0 + TILT_MAX_DEG + 5,
			betaNeutral: 0,
			gammaNeutral: 0,
		});
		expect(pointerX).toBe(100);
		expect(pointerY).toBe(100);
	});

	test("returns 0 on each axis when delta saturates at -TILT_MAX_DEG", () => {
		const { pointerX, pointerY } = computeTiltVars({
			beta: -TILT_MAX_DEG - 5,
			gamma: -TILT_MAX_DEG - 5,
			betaNeutral: 0,
			gammaNeutral: 0,
		});
		expect(pointerX).toBe(0);
		expect(pointerY).toBe(0);
	});

	test("linearly interpolates inside the swing range", () => {
		// halfway between neutral and +TILT_MAX_DEG → halfway between 50 and 100 = 75
		const { pointerX } = computeTiltVars({
			beta: 0,
			gamma: TILT_MAX_DEG / 2,
			betaNeutral: 0,
			gammaNeutral: 0,
		});
		expect(pointerX).toBe(75);
	});
});
```

- [ ] **Step 2.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && bun test src/components/holo-card/use-tilt-effect.test.ts
```
Expected: FAIL with "Cannot find module './use-tilt-effect'".

- [ ] **Step 2.4: Implement the hook + helper**

Create `src/components/holo-card/use-tilt-effect.ts`:

```ts
import type React from "react";
import { useEffect } from "react";
import { clamp, DEFAULT_POINTER, setHoloVars } from "./holo-vars";

export const TILT_MAX_DEG = 25;

export interface TiltReading {
	beta: number;
	gamma: number;
	betaNeutral: number;
	gammaNeutral: number;
}

/**
 * Pure mapping from a (beta, gamma) reading + a neutral baseline to
 * pointer-space coordinates (0..100). Exported for tests.
 */
export function computeTiltVars({
	beta,
	gamma,
	betaNeutral,
	gammaNeutral,
}: TiltReading): { pointerX: number; pointerY: number } {
	const gammaDelta = clamp(gamma - gammaNeutral, -TILT_MAX_DEG, TILT_MAX_DEG);
	const betaDelta = clamp(beta - betaNeutral, -TILT_MAX_DEG, TILT_MAX_DEG);
	const pointerX = 50 + (gammaDelta / TILT_MAX_DEG) * 50;
	const pointerY = 50 + (betaDelta / TILT_MAX_DEG) * 50;
	return { pointerX, pointerY };
}

export interface UseTiltEffectOptions {
	ref: React.RefObject<HTMLDivElement | null>;
	enabled: boolean;
}

/**
 * Subscribe window.deviceorientation while `enabled` is true. First event
 * after subscribe sets the neutral baseline; subsequent events compute
 * deltas and write the same CSS vars as the pointer hook. When disabled,
 * the element re-centers.
 */
export function useTiltEffect({ ref, enabled }: UseTiltEffectOptions): void {
	useEffect(() => {
		if (!enabled) return;
		const el = ref.current;
		if (!el) return;

		let betaNeutral: number | null = null;
		let gammaNeutral: number | null = null;

		function onOrient(e: DeviceOrientationEvent) {
			if (!el) return;
			const beta = e.beta;
			const gamma = e.gamma;
			if (beta === null || gamma === null) return;
			if (betaNeutral === null || gammaNeutral === null) {
				betaNeutral = beta;
				gammaNeutral = gamma;
				return;
			}
			const { pointerX, pointerY } = computeTiltVars({
				beta,
				gamma,
				betaNeutral,
				gammaNeutral,
			});
			setHoloVars(el, pointerX, pointerY);
		}

		window.addEventListener("deviceorientation", onOrient);
		return () => {
			window.removeEventListener("deviceorientation", onOrient);
			if (el) setHoloVars(el, DEFAULT_POINTER, DEFAULT_POINTER);
		};
	}, [ref, enabled]);
}
```

- [ ] **Step 2.5: Run tests**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && bun test src/components/holo-card/use-tilt-effect.test.ts
```
Expected: 4 pass.

- [ ] **Step 2.6: Verify whole suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && bun run typecheck && bun run lint && bun test
```
Expected: 127 total pass (123 + 4 new). Typecheck clean.

- [ ] **Step 2.7: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && git add src/components/holo-card/use-tilt-effect.ts src/components/holo-card/use-tilt-effect.test.ts && git commit -m "feat(holo-card): add useTiltEffect + computeTiltVars

Pure mapping from DeviceOrientationEvent (beta, gamma) with a calibration
baseline to pointer-space (0..100). Hook subscribes window orientation
while enabled, recenters on cleanup. ±25° swing clamps to 0..100. Tests
cover neutral, both saturation endpoints, and a midpoint."
```

---

## Task 3: `<HoloCard>` accepts `tilt?: boolean` prop

**Files:**
- Modify: `src/components/holo-card/holo-card.tsx`

- [ ] **Step 3.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && pwd && git branch --show-current
```

- [ ] **Step 3.2: Update `src/components/holo-card/holo-card.tsx`**

Read the existing file. Currently:

```tsx
import { useHoloEffect } from "./use-holo-effect";
// ...
export function HoloCard({ /* props */ }: HoloCardProps) {
	const { ref } = useHoloEffect();
	// ...
}
```

Add `tilt?: boolean` to `HoloCardProps` (place after `owned?: boolean`):

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
	tilt?: boolean;

	onClick?: (e: React.MouseEvent | React.KeyboardEvent) => void;
	hoverOverlay?: React.ReactNode;
	size?: "grid" | "focus";

	className?: string;
	style?: React.CSSProperties;
}
```

Import the new hook:

```tsx
import { useHoloEffect } from "./use-holo-effect";
import { useTiltEffect } from "./use-tilt-effect";
```

Destructure `tilt` with default `false`:

```tsx
export function HoloCard({
	imageUrl,
	name,
	rarity,
	owned = false,
	tilt = false,
	onClick,
	hoverOverlay,
	size = "grid",
	className,
	style,
}: HoloCardProps) {
	const { ref } = useHoloEffect();
	useTiltEffect({ ref, enabled: tilt });
	// ... existing body unchanged ...
}
```

The `tilt` prop is only ever true on `/card/:id` (Task 4 wires it). All other render paths pass nothing → tilt defaults to false → hook bails out of effect early and never subscribes.

- [ ] **Step 3.3: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && bun run typecheck && bun run lint && bun test
```
Expected: 127 tests still pass. Typecheck clean.

- [ ] **Step 3.4: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && git add src/components/holo-card/holo-card.tsx && git commit -m "feat(holo-card): accept tilt prop, wire useTiltEffect

Default false. When true, the card subscribes window orientation events
and animates the holo shine to match device tilt. Grid + timeline cards
omit the prop and stay pointer-only."
```

---

## Task 4: Wire tilt button + permission flow on `/card/:id`

**Files:**
- Modify: `src/pages/card-page.tsx`
- Modify: `src/pages/card-page.css`

- [ ] **Step 4.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && pwd && git branch --show-current
```

- [ ] **Step 4.2: Update `src/pages/card-page.tsx`**

Read the existing file. The page already has imports + `useLoaderData` + the collection button block. Add:

1. New imports near the existing React imports:

```tsx
import { useState } from "react";
```

(Add to whatever existing `react` import line is present; Biome will sort.)

2. Permission helper at module scope, near `toHoloCardData`:

```tsx
async function requestTiltPermission(): Promise<boolean> {
	if (typeof window === "undefined") return false;
	const D = window.DeviceOrientationEvent as
		| (typeof DeviceOrientationEvent & {
				requestPermission?: () => Promise<"granted" | "denied">;
		  })
		| undefined;
	if (!D) return false;
	if (typeof D.requestPermission === "function") {
		try {
			const result = await D.requestPermission();
			return result === "granted";
		} catch {
			return false;
		}
	}
	return true;
}
```

3. Inside `CardPage` component, after the existing collection state lines:

```tsx
const [tiltEnabled, setTiltEnabled] = useState(false);
const tiltSupported =
	typeof window !== "undefined" &&
	typeof window.DeviceOrientationEvent !== "undefined";

const onTiltClick = async () => {
	if (tiltEnabled) {
		setTiltEnabled(false);
		return;
	}
	const granted = await requestTiltPermission();
	if (granted) setTiltEnabled(true);
};
```

4. Pass `tilt={tiltEnabled}` to the `<HoloCard>` on this page. Read the existing JSX to find the `<HoloCard>` render block — it's likely the focus-size card render. Add the prop alongside the existing props.

5. Add the tilt button in the action row, next to the existing collection button:

```tsx
{tiltSupported && (
	<button
		type="button"
		className={`card-page-tilt-button${tiltEnabled ? " active" : ""}`}
		aria-pressed={tiltEnabled}
		onClick={onTiltClick}
	>
		{tiltEnabled ? "Tilt: On" : "Tilt to shine"}
	</button>
)}
```

Place it as a sibling next to the existing collection button.

- [ ] **Step 4.3: Append button CSS to `src/pages/card-page.css`**

```css
.card-page-tilt-button {
	padding: 0.65rem 1.5rem;
	margin-top: 0.75rem;
	margin-left: 0.5rem;
	background: rgba(120, 100, 255, 0.18);
	border: 1px solid rgba(120, 100, 255, 0.5);
	border-radius: 8px;
	color: inherit;
	font-size: 0.95rem;
	cursor: pointer;
	transition: background 0.12s ease-out;
}

.card-page-tilt-button:hover,
.card-page-tilt-button:focus-visible {
	background: rgba(120, 100, 255, 0.3);
	outline: none;
}

.card-page-tilt-button.active {
	background: rgba(80, 200, 120, 0.18);
	border-color: rgba(80, 200, 120, 0.6);
}

.card-page-tilt-button.active:hover,
.card-page-tilt-button.active:focus-visible {
	background: rgba(80, 200, 120, 0.3);
}
```

- [ ] **Step 4.4: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 127 tests still pass. Typecheck clean. Lint clean (one pre-existing warning). Build succeeds.

Note: existing card-page tests should still pass because the button only renders when `tiltSupported` is true. In happy-dom, `window.DeviceOrientationEvent` is undefined → `tiltSupported === false` → button absent → existing assertions (which don't query for the tilt button) unaffected.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && git add src/pages/card-page.tsx src/pages/card-page.css && git commit -m "feat(card-page): add Tilt to shine button + permission flow

iOS 13+ requires DeviceOrientationEvent.requestPermission() from a user
gesture. Android grants implicitly. One code path handles both.
Button is hidden on devices without DeviceOrientationEvent (desktop).
Tilt state is component-local; leaves on navigation."
```

---

## Task 5: Final verification + manual smoke

**Files:** none (read-only verification)

- [ ] **Step 5.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && pwd && git branch --show-current
```

- [ ] **Step 5.2: Run all checks**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 127 pass / 0 fail. Typecheck clean. Lint shows only the pre-existing `card-grid.css !important` warning. Build succeeds.

- [ ] **Step 5.3: Manual smoke test (desktop via devtools)**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && bun run dev
```

In a desktop browser at `http://localhost:5173/pokemon-tcg-viewer/`:

1. Navigate to `/card/base1-58`. Check that the tilt button is absent (`window.DeviceOrientationEvent` is undefined on most desktop browsers — Firefox is the exception). Move on if button absent.
2. If on Chrome desktop: open devtools → Customize and control → More tools → Sensors. Set orientation. The constructor still won't exist unless toggled in browser flags; expect button absent.
3. Open Chrome devtools → Toggle device toolbar (mobile emulation, e.g. iPhone 15). Reload. Button now visible.
4. Click "Tilt to shine". In emulation, `requestPermission` isn't present so the helper returns true immediately. Button flips to "Tilt: On".
5. In devtools → Sensors panel, change orientation values. Verify the holo highlight on the card moves.
6. Click "Tilt: On". Button reverts, holo recenters.

- [ ] **Step 5.4: Manual smoke test on real device (optional but recommended)**

If a phone is available:
1. Run `bun run dev --host` so the device on the same LAN can reach it.
2. Visit `http://<your-ip>:5173/pokemon-tcg-viewer/card/base1-58`.
3. iOS Safari: "Tilt to shine" → system prompt → Allow → tilt phone → holo tracks.
4. Android Chrome: "Tilt to shine" → no prompt → tilt phone → holo tracks.
5. Both: "Tilt: On" → tap to disable → highlight recenters.

- [ ] **Step 5.5: Console-clean check**

While dev server runs, open the browser console. Expect:
- No errors from React or React Router.
- No `[holo-card] Unknown rarity` warnings beyond pre-existing.
- Permission rejection (if it happens) does NOT throw; only logs nothing.

- [ ] **Step 5.6: Update spec status**

Edit `docs/superpowers/specs/2026-05-03-phase-4a-device-tilt-design.md`. Change:

```markdown
**Status:** Approved (design)
```

to:

```markdown
**Status:** Implemented
```

Commit:

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-tilt && git add docs/superpowers/specs/2026-05-03-phase-4a-device-tilt-design.md && git commit -m "docs: mark Phase 4a device-tilt spec as implemented"
```

---

## Done criteria

- [ ] All tasks 1–5 above checked off.
- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` all pass on the worktree.
- [ ] Manual smoke (Step 5.3) confirms button hidden on desktop, visible in mobile emulation, tilt drives holo highlight in devtools Sensors.
- [ ] Spec status reads "Implemented".

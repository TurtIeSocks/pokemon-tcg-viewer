# Phase 4 / #6 — Device Tilt for HoloCard (Phase 4a)

**Date:** 2026-05-03
**Status:** Implemented
**Roadmap phase:** 4 of 5 (split from "Phase 4 = #6 + #3"). 4b = #3 pack opening, separate spec.

## Context

The HoloCard's holographic shine tracks pointer position via `useHoloEffect` — mouse/touch only. On mobile, the card is static unless the user actively drags a finger across it. We extend the same CSS-var pipeline with a second input source: the device's accelerometer (`DeviceOrientationEvent`). Tilting the phone physically tilts the holo highlight.

Scope is intentionally narrow: tilt is enabled only on `/card/:id` (one card on screen, clear focal point, no perf cost). Grid and timeline cards are unchanged.

## Goals

1. **Tilt-driven holo shine on `/card/:id`** when user explicitly enables it.
2. **Reuse the existing CSS-var pipeline.** No new render path; tilt writes the same `--pointer-x`, `--pointer-y`, `--rotate-x`, `--rotate-y` properties that mouse currently writes.
3. **Permission handled cleanly across iOS + Android.** iOS 13+ needs `DeviceOrientationEvent.requestPermission()` from a user gesture; Android grants automatically. One button, one code path.
4. **Coexists with mouse on devices that have both** (e.g., desktop with touchscreen + accelerometer in some 2-in-1s). Mouse + tilt both call the same setter; last-writer-wins.
5. **Desktop is unchanged.** Feature-detect hides the button.

## Non-goals (deferred)

- Tilt on grid / timeline views.
- Persisted "always enable tilt" preference.
- Long-press / press-and-hold UX. Always-on once enabled.
- Tilt indicator overlay or HUD.
- Cross-axis remapping (locked to gamma→X, beta→Y).
- Analytics on enable/disable.

## Architecture

### Shared `setVars` module

Extract `setVars()` + constants from `use-holo-effect.ts` into `src/components/holo-card/holo-vars.ts`. Both hooks (existing pointer + new tilt) import it.

```ts
export const DEFAULT_POINTER = 50;
export const TILT_DIVISOR = 3.5;

export function clamp(n: number, min: number, max: number): number;
export function setHoloVars(el: HTMLElement, pointerX: number, pointerY: number): void;
```

`setHoloVars` is the existing `setVars` body, renamed to avoid collision with any other `setVars`-shaped helper. The hook's local `setVars` references become `setHoloVars`.

### `useTiltEffect` hook

`src/components/holo-card/use-tilt-effect.ts`:

```ts
export interface UseTiltEffectOptions {
  ref: React.RefObject<HTMLDivElement>;
  enabled: boolean;
}

export function useTiltEffect({ ref, enabled }: UseTiltEffectOptions): void;
```

Behavior:
- When `enabled` flips true: subscribe `window.deviceorientation`. First event after subscribe = "neutral" reading; record `betaNeutral`, `gammaNeutral`. Subsequent events compute delta, clamp to `±TILT_MAX_DEG` (constant), map linearly to 0..100, call `setHoloVars(el, pointerX, pointerY)`.
- When `enabled` flips false: unsubscribe; call `setHoloVars(el, DEFAULT_POINTER, DEFAULT_POINTER)` to recenter.
- When component unmounts: same cleanup.

Mapping:
```
TILT_MAX_DEG = 25
gammaDelta = clamp(gamma - gammaNeutral, -TILT_MAX_DEG, +TILT_MAX_DEG)
betaDelta  = clamp(beta  - betaNeutral,  -TILT_MAX_DEG, +TILT_MAX_DEG)
pointerX   = 50 + (gammaDelta / TILT_MAX_DEG) * 50   // 0..100
pointerY   = 50 + (betaDelta  / TILT_MAX_DEG) * 50   // 0..100
```

### Permission helper

Inline in `card-page.tsx` (small enough not to need its own file):

```ts
async function requestTiltPermission(): Promise<boolean> {
  const D = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (typeof D?.requestPermission === "function") {
    try {
      const result = await D.requestPermission();
      return result === "granted";
    } catch {
      return false;
    }
  }
  // Android / browsers without the API: assume granted as long as the event type exists.
  return typeof window.DeviceOrientationEvent !== "undefined";
}
```

### Card page wiring

`src/pages/card-page.tsx`:

```tsx
const [tiltEnabled, setTiltEnabled] = useState(false);
const cardRef = useRef<HTMLDivElement>(null);
useTiltEffect({ ref: cardRef, enabled: tiltEnabled });

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

The button sits in the same action row as "Add to collection":

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

### HoloCard ref forwarding

The existing `<HoloCard>` doesn't expose its inner DOM ref. The card-page needs to pass `cardRef` to the same DOM node `useHoloEffect` is already writing CSS vars on, so tilt and pointer both target one element.

Two options:
- (a) `forwardRef<HTMLDivElement, HoloCardProps>(...)` on `HoloCard`. Card-page passes `ref={cardRef}`. Inside `HoloCard`, merge `cardRef` with the internal hook ref via callback ref pattern.
- (b) Pass `tiltEnabled` as a prop to `HoloCard`. Tilt hook lives inside the component. No ref forwarding needed.

**Decision: (b).** Cleaner. `HoloCard` is already the owner of the holo DOM node; adding the tilt subscription there avoids cross-component ref plumbing. Card-page only sets the `tilt` prop:

```tsx
<HoloCard ... tilt={tiltEnabled} />
```

Inside `HoloCard`:

```tsx
const { ref } = useHoloEffect();
useTiltEffect({ ref, enabled: tilt ?? false });
```

The hook accepts the same ref returned by `useHoloEffect` — both write to the same element.

### CSS for the button

`src/pages/card-page.css` appends `.card-page-tilt-button` rules. Same general shape as the collection button (purple default, green on active).

## Risks

- **Permission UX on iOS**: the prompt is system-level; user has to tap "Allow Motion & Orientation Access". If denied, button reverts silently. No "denied" copy in v1.
- **Calibration drift**: long sessions could drift if the user walks around with the phone. Calibration is captured once per enable. User can disable + re-enable to recalibrate.
- **Coexistence with mouse**: on touch laptops, both can fire. Last writer wins; the holo visibly chases whichever input is moving. Acceptable.
- **Feature detection edge cases**: some browsers ship the constructor but never fire events. Hook silently no-ops if the calibration callback never fires.
- **Ref consistency**: `useHoloEffect` returns its internal ref; `useTiltEffect` accepts and reads it via `ref.current`. Both run inside the same component, so the ref is stable across renders. Pre-mount the ref will be null — hook bails out via `if (!el) return;`.

## Testing

New tests (~5, baseline 118 → 123):

`holo-vars.test.ts` (3 tests, pure):
- `clamp` returns input when in range
- `clamp` saturates at min and max
- `setHoloVars` writes all 9 CSS custom properties on the given element

`use-tilt-effect.test.ts` (2 tests, hook logic in pure form):
- The mapping function (`computeTiltVars(beta, gamma, betaNeutral, gammaNeutral)`) returns centered (50, 50) when reading equals neutral
- Mapping returns clamped endpoints (0 or 100) when delta exceeds `TILT_MAX_DEG`

Why no full hook integration test: happy-dom does not fire `deviceorientation`. Manual browser smoke test on a phone (Step in plan) is the verification.

Existing tests (118) must continue passing — `useHoloEffect` refactor is name-only, behavior identical.

## Manual smoke test

Requires a mobile device (or browser devtools "Sensors" panel).

1. Open `/card/base1-58` on phone. "Tilt to shine" button visible in action row.
2. Tap "Tilt to shine". iOS: system prompt → "Allow". Android: button just flips to "Tilt: On".
3. Tilt phone gently. Holo highlight tracks the tilt.
4. Tap "Tilt: On". Reverts to centered, button back to "Tilt to shine".
5. On desktop browser: button is absent (feature-detect).
6. In Chrome devtools → Sensors → set orientation values manually. Highlight moves.
7. On a touch device: mouse drag still works regardless of tilt enable state.

## Implementation order

1. Extract `setVars` → `holo-vars.ts`. Update `use-holo-effect.ts`.
2. Pure-function tilt math + tests.
3. `useTiltEffect` hook.
4. `HoloCard` accepts `tilt?: boolean` prop, calls hook.
5. `card-page.tsx` adds permission helper, button, state, passes `tilt` prop.
6. CSS for the button.
7. Manual smoke test on real device.

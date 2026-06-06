export const DEFAULT_POINTER = 50;
const TILT_DIVISOR = 3.5;

/**
 * Background-position remap bands. simey maps the raw pointer percentage into
 * a *narrow* band before feeding it to the foil's background-position so the
 * shine drifts subtly rather than sweeping the full 0–100% range. The X and Y
 * bands differ (Card.svelte interact(): adjust(x,…,37,63) / adjust(y,…,33,67)).
 */
const BG_X_MIN = 37;
const BG_X_MAX = 63;
const BG_Y_MIN = 33;
const BG_Y_MAX = 67;

export interface HoloState {
	x: number;
	y: number;
	o: number;
}

export function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

/** Round to a fixed precision, mirroring simey's helpers/Math.js round(). */
function round(value: number, precision = 3): number {
	return Number.parseFloat(value.toFixed(precision));
}

/** Re-map `value` from one range to another (simey's adjust()). */
function adjust(
	value: number,
	fromMin: number,
	fromMax: number,
	toMin: number,
	toMax: number,
): number {
	return round(
		toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin),
	);
}

/** Lerp every field of `cur` toward `tgt` by factor `k` (0..1). */
export function stepHoloState(
	cur: HoloState,
	tgt: HoloState,
	k: number,
): HoloState {
	return {
		x: cur.x + (tgt.x - cur.x) * k,
		y: cur.y + (tgt.y - cur.y) * k,
		o: cur.o + (tgt.o - cur.o) * k,
	};
}

/** True once every field of `cur` is within `eps` of `tgt`. */
export function isSettled(cur: HoloState, tgt: HoloState, eps = 0.01): boolean {
	return (
		Math.abs(cur.x - tgt.x) < eps &&
		Math.abs(cur.y - tgt.y) < eps &&
		Math.abs(cur.o - tgt.o) < eps
	);
}

/**
 * Write the pointer-driven CSS custom properties consumed by rarity-styles.css.
 *
 * Contract (must match simey/pokemon-cards-css, which our foil recipes are
 * ported from):
 *   • --pointer-x / --pointer-y carry `%` units — they land inside
 *     `radial-gradient(circle at var(--pointer-x) …)` and various calc()s that
 *     add percentages. A unitless value is invalid-at-computed-value-time and
 *     silently drops the entire background-image layer (and often the whole
 *     multi-layer list), which is what made premium foils render nothing.
 *   • --background-x / --background-y use simey's narrow remap bands.
 *   • --rotate-x / --rotate-y lean the card *toward* the cursor.
 *   • --card-opacity is driven by interaction state (passed in), not by
 *     distance-from-center — so the foil is visible across the whole face.
 */
export function setHoloVars(
	el: HTMLElement,
	pointerX: number,
	pointerY: number,
	opacity: number,
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

	el.style.setProperty("--pointer-x", `${round(px)}%`);
	el.style.setProperty("--pointer-y", `${round(py)}%`);
	el.style.setProperty("--pointer-from-center", `${round(fromCenter)}`);
	el.style.setProperty("--rotate-x", `${round(centerY / TILT_DIVISOR)}deg`);
	el.style.setProperty("--rotate-y", `${round(-centerX / TILT_DIVISOR)}deg`);
	el.style.setProperty(
		"--background-x",
		`${adjust(px, 0, 100, BG_X_MIN, BG_X_MAX)}%`,
	);
	el.style.setProperty(
		"--background-y",
		`${adjust(py, 0, 100, BG_Y_MIN, BG_Y_MAX)}%`,
	);
	el.style.setProperty("--pointer-from-left", `${round(px / 100)}`);
	el.style.setProperty("--pointer-from-top", `${round(py / 100)}`);
	el.style.setProperty("--card-opacity", `${round(clamp(opacity, 0, 1))}`);
}

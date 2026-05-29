import { useEffect, useRef } from "react";
import {
	DEFAULT_POINTER,
	type HoloState,
	isSettled,
	setHoloVars,
	stepHoloState,
} from "./holo-vars";

// Lerp factors per frame. ENGAGE is snappy (foil tracks the cursor closely);
// RELEASE is slower so the card eases back to rest after the pointer leaves —
// mirroring the spring feel of simey/pokemon-cards-css.
const ENGAGE_K = 0.12;
const RELEASE_K = 0.06;

/**
 * Pointer-tracking hook for the holo card. Smooths pointer motion through a
 * requestAnimationFrame lerp loop and writes CSS custom properties directly to
 * the element's inline style — never calls setState — so pointer motion never
 * triggers a React render. Critical for the virtualized grid which mounts
 * dozens of cards simultaneously. The loop only runs while the card is
 * settling, then stops, so idle cards cost nothing.
 */
export function useHoloEffect(forceFoil = false) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const cur: HoloState = { x: DEFAULT_POINTER, y: DEFAULT_POINTER, o: 0 };
		let tgt: HoloState = { x: DEFAULT_POINTER, y: DEFAULT_POINTER, o: 0 };
		let k = ENGAGE_K;
		let rafId: number | null = null;

		// Centered, hidden static state so a card looks correct before any
		// interaction (and before the first animation frame).
		setHoloVars(el, cur.x, cur.y, cur.o);

		// Static galaxy offset for cosmos foils so each card shows a different
		// region of the starfield (mirrors simey's per-card --cosmosbg seed).
		el.style.setProperty(
			"--cosmosbg",
			`${Math.floor(Math.random() * 734)}px ${Math.floor(Math.random() * 1280)}px`,
		);

		// Debug contact-sheet mode: hold the foil statically lit (off-centre so
		// the shine reads) and skip pointer tracking entirely.
		if (forceFoil) {
			setHoloVars(el, 38, 30, 1);
			return;
		}

		function frame() {
			if (!el) return;
			const next = stepHoloState(cur, tgt, k);
			cur.x = next.x;
			cur.y = next.y;
			cur.o = next.o;

			if (isSettled(cur, tgt)) {
				// Snap exactly onto the target for a clean final frame, then halt.
				cur.x = tgt.x;
				cur.y = tgt.y;
				cur.o = tgt.o;
				setHoloVars(el, cur.x, cur.y, cur.o);
				rafId = null;
				return;
			}

			setHoloVars(el, cur.x, cur.y, cur.o);
			rafId = requestAnimationFrame(frame);
		}

		function start() {
			if (rafId === null) rafId = requestAnimationFrame(frame);
		}

		function onMove(e: PointerEvent) {
			if (!el) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;
			const px = ((e.clientX - rect.left) / rect.width) * 100;
			const py = ((e.clientY - rect.top) / rect.height) * 100;
			tgt = { x: px, y: py, o: 1 };
			k = ENGAGE_K;
			start();
		}

		function onLeave() {
			tgt = { x: DEFAULT_POINTER, y: DEFAULT_POINTER, o: 0 };
			k = RELEASE_K;
			start();
		}

		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerleave", onLeave);
		return () => {
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerleave", onLeave);
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	}, [forceFoil]);

	return { ref };
}

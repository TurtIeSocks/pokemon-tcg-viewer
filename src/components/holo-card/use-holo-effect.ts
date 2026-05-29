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

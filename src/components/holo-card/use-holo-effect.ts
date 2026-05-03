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
	el.style.setProperty("--background-x", `${50 + (px - 50) * -0.5}%`);
	el.style.setProperty("--background-y", `${50 + (py - 50) * -0.5}%`);
	el.style.setProperty("--pointer-from-left", `${px / 100}`);
	el.style.setProperty("--pointer-from-top", `${py / 100}`);
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

		// Inner null guards are required for TypeScript narrowing into the inner
		// function scope, even though `el` is a const captured after a non-null
		// outer check. Without these, `tsc -b` reports TS18047 / TS2345.
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

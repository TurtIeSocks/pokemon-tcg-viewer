import { useEffect, useRef } from "react";
import { DEFAULT_POINTER, setHoloVars } from "./holo-vars";

/**
 * Spring constants — verbatim from simey/pokemon-cards-css Card.svelte.
 * INTERACT drives pointer tracking (snappy, slight overshoot — the springy
 * "physical foil" feel); SNAP eases the card back to rest after the pointer
 * leaves, applied after a short delay like the original (the foil stays lit
 * for a beat instead of dying the instant the cursor exits).
 */
const INTERACT = { stiffness: 0.066, damping: 0.25 };
const SNAP = { stiffness: 0.01, damping: 0.06 };
const RELEASE_DELAY_MS = 500;
/** svelte/motion spring default precision. */
const PRECISION = 0.01;

interface SpringField {
	cur: number;
	last: number;
	tgt: number;
}

function field(v: number): SpringField {
	return { cur: v, last: v, tgt: v };
}

/**
 * One tick of svelte/motion's spring integrator for a single scalar.
 * dt is in 60fps frame units ((now - then) * 60 / 1000), like svelte.
 * Returns true while still moving.
 */
function tickSpring(
	f: SpringField,
	dt: number,
	stiffness: number,
	damping: number,
	invMass: number,
): boolean {
	const delta = f.tgt - f.cur;
	const velocity = (f.cur - f.last) / (dt || 1 / 60);
	const spring = stiffness * delta;
	const damper = damping * velocity;
	const acceleration = (spring - damper) * invMass;
	const d = (velocity + acceleration) * dt;
	if (Math.abs(d) < PRECISION && Math.abs(delta) < PRECISION) {
		f.last = f.cur;
		f.cur = f.tgt;
		return false;
	}
	f.last = f.cur;
	f.cur += d;
	return true;
}

/**
 * Pointer-tracking hook for the holo card. Runs simey's spring physics
 * (ported from svelte/motion) through a requestAnimationFrame loop and writes
 * CSS custom properties directly to the element's inline style — never calls
 * setState — so pointer motion never triggers a React render. Critical for
 * the virtualized grid which mounts dozens of cards simultaneously. The loop
 * only runs while the springs are settling, then stops, so idle cards cost
 * nothing.
 */
export function useHoloEffect(forceFoil = false) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const x = field(DEFAULT_POINTER);
		const y = field(DEFAULT_POINTER);
		const o = field(0);
		let stiffness = INTERACT.stiffness;
		let damping = INTERACT.damping;
		// simey releases with {soft: 1}: acceleration ramps 0→1 over ~1s so the
		// snap-back starts gently instead of jerking.
		let invMass = 1;
		let invMassRecovery = 0;
		let rafId: number | null = null;
		let lastTime = 0;
		let releaseTimer: ReturnType<typeof setTimeout> | null = null;

		// Centered, hidden static state so a card looks correct before any
		// interaction (and before the first animation frame).
		setHoloVars(el, x.cur, y.cur, o.cur);

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

		function frame(now: number) {
			if (!el) return;
			// Frame delta in 60fps units, like svelte/motion. Clamped so a
			// backgrounded tab doesn't integrate one huge explosive step.
			const dt = lastTime ? Math.min(((now - lastTime) * 60) / 1000, 4) : 1;
			lastTime = now;
			invMass = Math.min(invMass + invMassRecovery, 1);

			// Array literal so all three axes tick every frame (|| would
			// short-circuit and freeze the later axes mid-flight).
			const moving = [
				tickSpring(x, dt, stiffness, damping, invMass),
				tickSpring(y, dt, stiffness, damping, invMass),
				tickSpring(o, dt, stiffness, damping, invMass),
			].some(Boolean);

			setHoloVars(el, x.cur, y.cur, o.cur);

			if (moving) {
				rafId = requestAnimationFrame(frame);
			} else {
				rafId = null;
				lastTime = 0;
			}
		}

		function start() {
			if (rafId === null) rafId = requestAnimationFrame(frame);
		}

		function engage() {
			if (releaseTimer !== null) {
				clearTimeout(releaseTimer);
				releaseTimer = null;
			}
			stiffness = INTERACT.stiffness;
			damping = INTERACT.damping;
			invMass = 1;
			invMassRecovery = 0;
		}

		function onMove(e: PointerEvent) {
			if (!el) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;
			engage();
			x.tgt = ((e.clientX - rect.left) / rect.width) * 100;
			y.tgt = ((e.clientY - rect.top) / rect.height) * 100;
			o.tgt = 1;
			start();
		}

		function onLeave() {
			if (releaseTimer !== null) clearTimeout(releaseTimer);
			releaseTimer = setTimeout(() => {
				releaseTimer = null;
				stiffness = SNAP.stiffness;
				damping = SNAP.damping;
				invMass = 0;
				invMassRecovery = 1 / 60; // {soft: 1} — recover over ~1s of frames
				x.tgt = DEFAULT_POINTER;
				y.tgt = DEFAULT_POINTER;
				o.tgt = 0;
				start();
			}, RELEASE_DELAY_MS);
		}

		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerleave", onLeave);
		return () => {
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerleave", onLeave);
			if (releaseTimer !== null) clearTimeout(releaseTimer);
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	}, [forceFoil]);

	return { ref };
}

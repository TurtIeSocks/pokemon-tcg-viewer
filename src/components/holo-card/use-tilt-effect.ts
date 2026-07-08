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
/**
 * iOS 13+ gates DeviceOrientationEvent behind a permission that can ONLY be
 * requested from a user gesture. Call this from the tap that opens the tilt view
 * (e.g. the lightbox); it is a no-op where no permission is required (Android,
 * desktop) or the API is absent. Errors (denied, insecure context) are swallowed.
 */
export function ensureTiltPermission(): void {
	const D =
		typeof DeviceOrientationEvent !== "undefined"
			? (DeviceOrientationEvent as unknown as {
					requestPermission?: () => Promise<PermissionState>;
				})
			: undefined;
	if (typeof D?.requestPermission === "function") {
		void D.requestPermission().catch(() => {});
	}
}

export function useTiltEffect({ ref, enabled }: UseTiltEffectOptions): void {
	useEffect(() => {
		if (!enabled) return;
		// Honor the OS reduced-motion setting even when cardMotion is on.
		if (
			typeof window !== "undefined" &&
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
		)
			return;
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
			// Opacity 1 while tilting so the foil stays lit (the pointer hook's
			// rAF spring is desktop-only; device-orientation already streams
			// smoothly, so tilt writes directly).
			setHoloVars(el, pointerX, pointerY, 1);
		}

		window.addEventListener("deviceorientation", onOrient);
		return () => {
			window.removeEventListener("deviceorientation", onOrient);
			if (el) setHoloVars(el, DEFAULT_POINTER, DEFAULT_POINTER, 0);
		};
	}, [ref, enabled]);
}

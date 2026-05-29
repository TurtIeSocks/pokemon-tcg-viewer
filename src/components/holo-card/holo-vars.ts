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

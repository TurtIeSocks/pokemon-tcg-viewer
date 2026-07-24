import { afterEach, beforeEach, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { useHoloEffect } from "./use-holo-effect";

function Probe() {
	const { ref } = useHoloEffect();
	return <div ref={ref} data-testid="card" />;
}

const RECT = {
	left: 0,
	top: 0,
	width: 100,
	height: 100,
	right: 100,
	bottom: 100,
	x: 0,
	y: 0,
	toJSON: () => ({}),
} as DOMRect;

// The hook smooths pointer motion through a requestAnimationFrame lerp loop.
// Replace rAF with a manual queue so a test can drain frames synchronously and
// observe the converged (settled) state deterministically.
let rafQueue: FrameRequestCallback[] = [];
let realRaf: typeof requestAnimationFrame;
let realCancel: typeof cancelAnimationFrame;

beforeEach(() => {
	rafQueue = [];
	realRaf = globalThis.requestAnimationFrame;
	realCancel = globalThis.cancelAnimationFrame;
	globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
		rafQueue.push(cb);
		return rafQueue.length;
	}) as typeof requestAnimationFrame;
	globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
});

afterEach(() => {
	globalThis.requestAnimationFrame = realRaf;
	globalThis.cancelAnimationFrame = realCancel;
});

function flush(maxFrames = 5000) {
	let i = 0;
	while (rafQueue.length && i++ < maxFrames) {
		const cb = rafQueue.shift();
		if (!cb) break;
		cb(0);
	}
}

/** Mount `<Probe>` and return its element with a stubbed bounding rect (RECT). */
function mountProbe() {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;
	el.getBoundingClientRect = () => RECT;
	return el;
}

/** Dispatch a bubbling pointermove at client coords (x, y) on `el`. */
function movePointer(el: HTMLElement, x: number, y: number) {
	el.dispatchEvent(
		new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }),
	);
}

test("hook writes centered, hidden state on mount (no animation needed)", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;
	expect(el.style.getPropertyValue("--pointer-x")).toBe("50%");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("50%");
	expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
	expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
	expect(el.style.getPropertyValue("--background-x")).toBe("50%");
	expect(el.style.getPropertyValue("--background-y")).toBe("50%");
	expect(el.style.getPropertyValue("--card-opacity")).toBe(
		"calc(0 * var(--shine-intensity, 1))",
	);
	// Mount must not require a frame to look correct.
	expect(rafQueue.length).toBe(0);
});

test("pointermove eases toward the pointer and fades the foil in", () => {
	const el = mountProbe();

	movePointer(el, 75, 75);
	flush();

	expect(el.style.getPropertyValue("--pointer-x")).toBe("75%");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("75%");
	// simey's narrow background band + facing-the-cursor tilt.
	expect(el.style.getPropertyValue("--background-x")).toBe("56.5%");
	expect(el.style.getPropertyValue("--background-y")).toBe("58.5%");
	expect(el.style.getPropertyValue("--rotate-x")).toBe("7.143deg");
	expect(el.style.getPropertyValue("--rotate-y")).toBe("-7.143deg");
	// Opacity is interaction-driven (reaches 1), NOT distance-from-center.
	expect(el.style.getPropertyValue("--card-opacity")).toBe(
		"calc(1 * var(--shine-intensity, 1))",
	);
});

test("pointerleave eases back to the centered, hidden state", () => {
	const el = mountProbe();

	movePointer(el, 90, 90);
	flush();
	// The release is deferred 500ms (simey keeps the foil lit for a beat after
	// the pointer leaves). Run the deferral synchronously so the test can drain
	// the spring without a real clock.
	const realSetTimeout = globalThis.setTimeout;
	globalThis.setTimeout = ((cb: () => void) => {
		cb();
		return 0;
	}) as never;
	try {
		el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
	} finally {
		globalThis.setTimeout = realSetTimeout;
	}
	flush(20000);

	expect(el.style.getPropertyValue("--pointer-x")).toBe("50%");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("50%");
	expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
	expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
	expect(el.style.getPropertyValue("--background-x")).toBe("50%");
	expect(el.style.getPropertyValue("--background-y")).toBe("50%");
	expect(el.style.getPropertyValue("--card-opacity")).toBe(
		"calc(0 * var(--shine-intensity, 1))",
	);
});

test("pointer interaction never triggers a React re-render", () => {
	let renderCount = 0;
	function CountingProbe() {
		renderCount++;
		const { ref } = useHoloEffect();
		return <div ref={ref} data-testid="card" />;
	}
	const { getByTestId } = render(<CountingProbe />);
	const el = getByTestId("card") as HTMLElement;
	el.getBoundingClientRect = () => RECT;
	const baseline = renderCount;

	movePointer(el, 25, 25);
	movePointer(el, 75, 75);
	el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
	flush();

	expect(renderCount).toBe(baseline);
});

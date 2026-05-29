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

test("hook writes centered, hidden state on mount (no animation needed)", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;
	expect(el.style.getPropertyValue("--pointer-x")).toBe("50%");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("50%");
	expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
	expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
	expect(el.style.getPropertyValue("--background-x")).toBe("50%");
	expect(el.style.getPropertyValue("--background-y")).toBe("50%");
	expect(el.style.getPropertyValue("--card-opacity")).toBe("0");
	// Mount must not require a frame to look correct.
	expect(rafQueue.length).toBe(0);
});

test("pointermove eases toward the pointer and fades the foil in", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;
	el.getBoundingClientRect = () => RECT;

	el.dispatchEvent(
		new PointerEvent("pointermove", {
			clientX: 75,
			clientY: 75,
			bubbles: true,
		}),
	);
	flush();

	expect(el.style.getPropertyValue("--pointer-x")).toBe("75%");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("75%");
	// simey's narrow background band + facing-the-cursor tilt.
	expect(el.style.getPropertyValue("--background-x")).toBe("56.5%");
	expect(el.style.getPropertyValue("--background-y")).toBe("58.5%");
	expect(el.style.getPropertyValue("--rotate-x")).toBe("7.143deg");
	expect(el.style.getPropertyValue("--rotate-y")).toBe("-7.143deg");
	// Opacity is interaction-driven (reaches 1), NOT distance-from-center.
	expect(el.style.getPropertyValue("--card-opacity")).toBe("1");
});

test("pointerleave eases back to the centered, hidden state", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;
	el.getBoundingClientRect = () => RECT;

	el.dispatchEvent(
		new PointerEvent("pointermove", {
			clientX: 90,
			clientY: 90,
			bubbles: true,
		}),
	);
	flush();
	el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
	flush();

	expect(el.style.getPropertyValue("--pointer-x")).toBe("50%");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("50%");
	expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
	expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
	expect(el.style.getPropertyValue("--background-x")).toBe("50%");
	expect(el.style.getPropertyValue("--background-y")).toBe("50%");
	expect(el.style.getPropertyValue("--card-opacity")).toBe("0");
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

	el.dispatchEvent(
		new PointerEvent("pointermove", {
			clientX: 25,
			clientY: 25,
			bubbles: true,
		}),
	);
	el.dispatchEvent(
		new PointerEvent("pointermove", {
			clientX: 75,
			clientY: 75,
			bubbles: true,
		}),
	);
	el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
	flush();

	expect(renderCount).toBe(baseline);
});

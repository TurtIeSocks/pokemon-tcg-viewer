import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { useHoloEffect } from "./use-holo-effect";

function Probe() {
	const { ref } = useHoloEffect();
	return <div ref={ref} data-testid="card" />;
}

test("hook attaches default custom properties on mount", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;
	expect(el.style.getPropertyValue("--pointer-x")).toBe("50");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("50");
	expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
	expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
	expect(el.style.getPropertyValue("--background-x")).toBe("50%");
	expect(el.style.getPropertyValue("--background-y")).toBe("50%");
	expect(el.style.getPropertyValue("--pointer-from-left")).toBe("0.5");
	expect(el.style.getPropertyValue("--pointer-from-top")).toBe("0.5");
});

test("pointermove updates all custom properties from rect-relative position", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;

	// Stub getBoundingClientRect: 100x100 element at origin.
	el.getBoundingClientRect = () =>
		({
			left: 0,
			top: 0,
			width: 100,
			height: 100,
			right: 100,
			bottom: 100,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}) as DOMRect;

	el.dispatchEvent(
		new PointerEvent("pointermove", {
			clientX: 75,
			clientY: 75,
			bubbles: true,
		}),
	);

	expect(el.style.getPropertyValue("--pointer-x")).toBe("75");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("75");

	const fromCenter = Number.parseFloat(
		el.style.getPropertyValue("--pointer-from-center"),
	);
	expect(fromCenter).toBeCloseTo(Math.SQRT1_2, 6);

	const rotateX = Number.parseFloat(el.style.getPropertyValue("--rotate-x"));
	expect(rotateX).toBeCloseTo(-7.142857142857143, 6);

	const rotateY = Number.parseFloat(el.style.getPropertyValue("--rotate-y"));
	expect(rotateY).toBeCloseTo(7.142857142857143, 6);

	expect(el.style.getPropertyValue("--background-x")).toBe("37.5%");
	expect(el.style.getPropertyValue("--background-y")).toBe("37.5%");
	expect(el.style.getPropertyValue("--pointer-from-left")).toBe("0.75");
	expect(el.style.getPropertyValue("--pointer-from-top")).toBe("0.75");
});

test("pointerleave resets pointer position to center", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;
	el.getBoundingClientRect = () =>
		({
			left: 0,
			top: 0,
			width: 100,
			height: 100,
			right: 100,
			bottom: 100,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}) as DOMRect;

	el.dispatchEvent(
		new PointerEvent("pointermove", {
			clientX: 90,
			clientY: 90,
			bubbles: true,
		}),
	);
	el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));

	expect(el.style.getPropertyValue("--pointer-x")).toBe("50");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("50");
	expect(el.style.getPropertyValue("--rotate-x")).toBe("0deg");
	expect(el.style.getPropertyValue("--rotate-y")).toBe("0deg");
	expect(el.style.getPropertyValue("--background-x")).toBe("50%");
	expect(el.style.getPropertyValue("--background-y")).toBe("50%");
	expect(el.style.getPropertyValue("--pointer-from-left")).toBe("0.5");
	expect(el.style.getPropertyValue("--pointer-from-top")).toBe("0.5");
});

test("pointer events do not trigger re-renders (no-setState invariant)", () => {
	let renderCount = 0;
	function CountingProbe() {
		renderCount++;
		const { ref } = useHoloEffect();
		return <div ref={ref} data-testid="card" />;
	}
	const { getByTestId } = render(<CountingProbe />);
	const el = getByTestId("card") as HTMLElement;
	el.getBoundingClientRect = () =>
		({
			left: 0,
			top: 0,
			width: 100,
			height: 100,
			right: 100,
			bottom: 100,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}) as DOMRect;
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
	expect(renderCount).toBe(baseline);
});

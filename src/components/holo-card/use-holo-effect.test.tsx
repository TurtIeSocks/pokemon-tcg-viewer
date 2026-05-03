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
});

test("pointermove updates --pointer-x / --pointer-y based on rect-relative position", () => {
	const { getByTestId } = render(<Probe />);
	const el = getByTestId("card") as HTMLElement;

	// Stub getBoundingClientRect: 100x200 element at origin.
	el.getBoundingClientRect = () =>
		({
			left: 0,
			top: 0,
			width: 100,
			height: 200,
			right: 100,
			bottom: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}) as DOMRect;

	el.dispatchEvent(
		new PointerEvent("pointermove", {
			clientX: 75,
			clientY: 100,
			bubbles: true,
		}),
	);

	expect(el.style.getPropertyValue("--pointer-x")).toBe("75");
	expect(el.style.getPropertyValue("--pointer-y")).toBe("50");
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
});

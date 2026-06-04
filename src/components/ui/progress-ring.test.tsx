import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { ProgressRing } from "./progress-ring";

function getArcCircle(container: HTMLElement) {
	const circles = container.querySelectorAll("circle");
	// Second circle is the accent arc
	return circles[1] as SVGCircleElement;
}

test("pct=0 → dashoffset ≈ circumference (empty ring)", () => {
	const { container } = render(<ProgressRing pct={0} />);
	const arc = getArcCircle(container);
	const dasharray = Number(arc.getAttribute("stroke-dasharray"));
	const dashoffset = Number(arc.getAttribute("stroke-dashoffset"));
	expect(Math.abs(dashoffset - dasharray)).toBeLessThan(0.01);
});

test("pct=100 → dashoffset ≈ 0 (full ring)", () => {
	const { container } = render(<ProgressRing pct={100} />);
	const arc = getArcCircle(container);
	const dashoffset = Number(arc.getAttribute("stroke-dashoffset"));
	expect(Math.abs(dashoffset)).toBeLessThan(0.01);
});

test("pct=250 clamps to full (dashoffset ≈ 0)", () => {
	const { container } = render(<ProgressRing pct={250} />);
	const arc = getArcCircle(container);
	const dashoffset = Number(arc.getAttribute("stroke-dashoffset"));
	expect(Math.abs(dashoffset)).toBeLessThan(0.01);
});

test("pct=50 → dashoffset ≈ half circumference", () => {
	const { container } = render(<ProgressRing pct={50} />);
	const arc = getArcCircle(container);
	const dasharray = Number(arc.getAttribute("stroke-dasharray"));
	const dashoffset = Number(arc.getAttribute("stroke-dashoffset"));
	expect(Math.abs(dashoffset - dasharray / 2)).toBeLessThan(0.01);
});

test("children are rendered inside the ring", () => {
	const { getByText } = render(<ProgressRing pct={42}>hello</ProgressRing>);
	expect(getByText("hello")).toBeTruthy();
});

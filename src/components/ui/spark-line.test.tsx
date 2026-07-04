import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { SparkLine } from "./spark-line";

test("renders a polyline with a point per datum", () => {
	const { container } = render(
		<SparkLine
			points={[
				[0, 100],
				[1, 200],
				[2, 150],
			]}
			width={120}
			height={40}
		/>,
	);
	const poly = container.querySelector("polyline");
	expect(poly).not.toBeNull();
	// 3 points → 3 "x,y" pairs in the points attr
	expect(poly?.getAttribute("points")?.trim().split(/\s+/).length).toBe(3);
});

test("renders no polyline for fewer than 2 points", () => {
	const { container } = render(
		<SparkLine points={[[0, 100]]} width={120} height={40} />,
	);
	expect(container.querySelector("polyline")).toBeNull();
});

test("renders no polyline for zero points", () => {
	const { container } = render(
		<SparkLine points={[]} width={120} height={40} />,
	);
	expect(container.querySelector("polyline")).toBeNull();
});

test("guards the degenerate all-equal-values case (no NaN, flat line)", () => {
	const { container } = render(
		<SparkLine
			points={[
				[0, 50],
				[1, 50],
				[2, 50],
			]}
			width={120}
			height={40}
		/>,
	);
	const poly = container.querySelector("polyline");
	expect(poly).not.toBeNull();
	const pointsAttr = poly?.getAttribute("points") ?? "";
	expect(pointsAttr).not.toContain("NaN");
	// all y-coords should be equal (flat line at mid-height)
	const ys = pointsAttr
		.trim()
		.split(/\s+/)
		.map((pair) => Number(pair.split(",")[1]));
	expect(ys.every((y) => y === ys[0])).toBe(true);
});

test("filters out null y-values before scaling", () => {
	const { container } = render(
		<SparkLine
			points={[
				[0, 100],
				[1, null],
				[2, 150],
			]}
			width={120}
			height={40}
		/>,
	);
	const poly = container.querySelector("polyline");
	expect(poly).not.toBeNull();
	expect(poly?.getAttribute("points")?.trim().split(/\s+/).length).toBe(2);
});

test("y-inversion: higher value renders at a smaller y (higher on screen)", () => {
	const { container } = render(
		<SparkLine
			points={[
				[0, 0],
				[1, 100],
			]}
			width={120}
			height={40}
		/>,
	);
	const poly = container.querySelector("polyline");
	const pairs =
		poly
			?.getAttribute("points")
			?.trim()
			.split(/\s+/)
			.map((pair) => pair.split(",").map(Number)) ?? [];
	const [, yLow] = pairs[0] ?? [];
	const [, yHigh] = pairs[1] ?? [];
	// value 100 (higher) must have a smaller y than value 0 (lower)
	expect(yHigh).toBeLessThan(yLow);
});

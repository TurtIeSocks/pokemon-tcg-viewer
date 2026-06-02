import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { getTypeColor } from "../../utils/card-colors";
import { ENERGY_GLYPH_FALLBACK } from "./energy-glyphs";
import { EnergyIcon } from "./energy-icon";

test("renders svg with aria-label equal to type", () => {
	render(<EnergyIcon type="Lightning" />);
	const svg = screen.getByRole("img", { name: "Lightning" });
	expect(svg).toBeDefined();
	expect(svg.tagName.toLowerCase()).toBe("svg");
});

test("circle fill matches getTypeColor for known type", () => {
	render(<EnergyIcon type="Lightning" />);
	const svg = screen.getByRole("img", { name: "Lightning" });
	const circle = svg.querySelector("circle");
	expect(circle).toBeDefined();
	expect(circle!.getAttribute("fill")).toBe(getTypeColor("Lightning"));
});

test("unknown type falls back to Colorless fill", () => {
	render(<EnergyIcon type="Bogus" />);
	const svg = screen.getByRole("img", { name: "Bogus" });
	const circle = svg.querySelector("circle");
	expect(circle).toBeDefined();
	expect(circle!.getAttribute("fill")).toBe(getTypeColor("Colorless"));
});

test("unknown type still renders aria-label as given type", () => {
	render(<EnergyIcon type="Bogus" />);
	const svg = screen.getByRole("img", { name: "Bogus" });
	expect(svg.getAttribute("aria-label")).toBe("Bogus");
});

test("unknown type uses fallback glyph path", () => {
	render(<EnergyIcon type="Bogus" />);
	const svg = screen.getByRole("img", { name: "Bogus" });
	const path = svg.querySelector("path");
	expect(path).toBeDefined();
	expect(path!.getAttribute("d")).toBe(ENERGY_GLYPH_FALLBACK);
});

test("size prop sets width and height attributes", () => {
	render(<EnergyIcon type="Fire" size={32} />);
	const svg = screen.getByRole("img", { name: "Fire" });
	expect(svg.getAttribute("width")).toBe("32");
	expect(svg.getAttribute("height")).toBe("32");
});

test("default size is 18", () => {
	render(<EnergyIcon type="Water" />);
	const svg = screen.getByRole("img", { name: "Water" });
	expect(svg.getAttribute("width")).toBe("18");
	expect(svg.getAttribute("height")).toBe("18");
});

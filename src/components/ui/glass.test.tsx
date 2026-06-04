import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { BezelPanel, GlassPanel } from "./glass";

test("GlassPanel renders children", () => {
	const { getByText } = render(<GlassPanel>hello glass</GlassPanel>);
	expect(getByText("hello glass")).toBeTruthy();
});

test("GlassPanel has backdrop-blur-xl class", () => {
	const { container } = render(<GlassPanel>content</GlassPanel>);
	const el = container.firstElementChild as HTMLElement;
	expect(el.className).toContain("backdrop-blur-xl");
});

test("GlassPanel with interactive has hover:-translate-y-1 class", () => {
	const { container } = render(<GlassPanel interactive>content</GlassPanel>);
	const el = container.firstElementChild as HTMLElement;
	expect(el.className).toContain("hover:-translate-y-1");
});

test("BezelPanel renders children", () => {
	const { getByText } = render(<BezelPanel>bezel child</BezelPanel>);
	expect(getByText("bezel child")).toBeTruthy();
});

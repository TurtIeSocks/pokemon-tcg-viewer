import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { Stat } from "./stat";

test("Stat renders value and label", () => {
	const { getByText } = render(<Stat value="1,248" label="owned" />);
	expect(getByText("1,248")).toBeTruthy();
	expect(getByText("owned")).toBeTruthy();
});

test("Stat without tone renders value with ink class", () => {
	const { container } = render(<Stat value="42" label="cards" />);
	const valueEl = container.querySelector(".tabular-nums") as HTMLElement;
	expect(valueEl.className).toContain("text-(--ink)");
});

test("Stat with tone=up renders value with success class", () => {
	const { container } = render(<Stat value="99" label="new" tone="up" />);
	const valueEl = container.querySelector(".tabular-nums") as HTMLElement;
	expect(valueEl.className).toContain("text-(--success)");
});

test("Stat down tone uses the danger color", () => {
	const { container } = render(<Stat value="-$5.00" label="p&l" tone="down" />);
	const valueEl = container.querySelector(".tabular-nums") as HTMLElement;
	expect(valueEl.className).toContain("text-(--danger)");
});

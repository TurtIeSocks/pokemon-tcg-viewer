import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { CardTabs } from "./card-tabs";

test("renders a tablist with three tabs and marks the active one", () => {
	render(<CardTabs tab="details" onChange={() => {}} />);
	expect(screen.getByRole("tablist")).toBeDefined();
	const tabs = screen.getAllByRole("tab");
	expect(tabs.length).toBe(3);
	expect(
		screen.getByRole("tab", { name: "Details" }).getAttribute("aria-selected"),
	).toBe("true");
	expect(
		screen.getByRole("tab", { name: "Pricing" }).getAttribute("aria-selected"),
	).toBe("false");
});

test("clicking a tab calls onChange with its value", () => {
	const onChange = mock((_: string) => {});
	render(<CardTabs tab="details" onChange={onChange} />);
	fireEvent.click(screen.getByRole("tab", { name: "Collection" }));
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange.mock.calls[0][0]).toBe("collection");
});

test("ArrowRight from the active tab selects the next tab", () => {
	const onChange = mock((_: string) => {});
	render(<CardTabs tab="details" onChange={onChange} />);
	fireEvent.keyDown(screen.getByRole("tab", { name: "Details" }), {
		key: "ArrowRight",
	});
	expect(onChange.mock.calls[0][0]).toBe("collection");
});

test("active tab is the only one in the tab order (roving tabIndex)", () => {
	render(<CardTabs tab="collection" onChange={() => {}} />);
	expect(
		screen.getByRole("tab", { name: "Collection" }).getAttribute("tabindex"),
	).toBe("0");
	expect(
		screen.getByRole("tab", { name: "Details" }).getAttribute("tabindex"),
	).toBe("-1");
});

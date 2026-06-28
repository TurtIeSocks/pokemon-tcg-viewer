// src/components/islands/card-sort-control.test.tsx
import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import { CardSortControl } from "./card-sort-control";

function renderControl(overrides = {}, onChange = () => {}) {
	return render(
		<CardSortControl
			value={{ ...LIST_SEARCH_DEFAULTS, ...overrides }}
			onChange={onChange}
		/>,
	);
}

test("shows the active sort label and offers the card sort modes", async () => {
	renderControl({ sort: "name" });
	expect(screen.getByRole("button", { name: "Sort by" }).textContent).toContain(
		"Name",
	);
	fireEvent.pointerDown(screen.getByRole("button", { name: "Sort by" }), {
		button: 0,
		ctrlKey: false,
	});
	expect(
		await screen.findByRole("menuitemradio", { name: "Release date" }),
	).toBeDefined();
	expect(screen.getByRole("menuitemradio", { name: "Card #" })).toBeDefined();
});

test("selecting a mode fires onChange with sort + reset dir asc", async () => {
	const onChange = mock(() => {});
	renderControl({ sort: "default" }, onChange);
	fireEvent.pointerDown(screen.getByRole("button", { name: "Sort by" }), {
		button: 0,
		ctrlKey: false,
	});
	fireEvent.click(await screen.findByRole("menuitemradio", { name: "Name" }));
	expect(onChange).toHaveBeenCalledWith({ sort: "name", dir: "asc" });
});

test("toggling direction fires onChange with dir", () => {
	const onChange = mock(() => {});
	renderControl({ sort: "name", dir: "asc" }, onChange);
	fireEvent.click(screen.getByRole("button", { name: "Sort ascending" }));
	expect(onChange).toHaveBeenCalledWith({ dir: "desc" });
});

test("the direction toggle is disabled for the Default mode", () => {
	renderControl({ sort: "default" });
	expect(
		(
			screen.getByRole("button", {
				name: "Sort ascending",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
});

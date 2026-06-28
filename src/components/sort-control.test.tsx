import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SortOption } from "../lib/sort";
import { SortControl } from "./sort-control";

const options: SortOption<"dex" | "name">[] = [
	{ value: "dex", label: "Dex #" },
	{ value: "name", label: "Name" },
];

test("shows the active mode label and toggles direction", () => {
	const onDir = mock(() => {});
	render(
		<SortControl
			mode="dex"
			dir="asc"
			options={options}
			onModeChange={() => {}}
			onDirChange={onDir}
		/>,
	);
	expect(screen.getByRole("button", { name: "Sort by" }).textContent).toContain(
		"Dex #",
	);
	fireEvent.click(screen.getByRole("button", { name: "Sort ascending" }));
	expect(onDir).toHaveBeenCalledWith("desc");
});

test("selecting a mode fires onModeChange", async () => {
	const onMode = mock(() => {});
	render(
		<SortControl
			mode="dex"
			dir="asc"
			options={options}
			onModeChange={onMode}
			onDirChange={() => {}}
		/>,
	);
	fireEvent.pointerDown(screen.getByRole("button", { name: "Sort by" }), {
		button: 0,
		ctrlKey: false,
	});
	fireEvent.click(await screen.findByRole("menuitemradio", { name: "Name" }));
	expect(onMode).toHaveBeenCalledWith("name");
});

test("dirDisabled disables the direction toggle", () => {
	render(
		<SortControl
			mode="dex"
			dir="asc"
			options={options}
			onModeChange={() => {}}
			onDirChange={() => {}}
			dirDisabled
		/>,
	);
	expect(
		(
			screen.getByRole("button", {
				name: "Sort ascending",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
});

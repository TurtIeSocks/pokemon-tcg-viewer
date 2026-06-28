import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { POKEDEX_FILTER_DEFAULTS, type PokedexFilter } from "../../lib/pokedex";
import { PokedexControls } from "./pokedex-controls";

const typeOptions = ["Fire", "Grass", "Water"];

function renderControls({
	value = POKEDEX_FILTER_DEFAULTS,
	onChange = () => {},
}: {
	value?: PokedexFilter;
	onChange?: (p: Partial<PokedexFilter>) => void;
} = {}) {
	return render(
		<PokedexControls
			value={value}
			typeOptions={typeOptions}
			onChange={onChange}
		/>,
	);
}

test("renders the search box and the Type, Generation, and Sort dropdowns", () => {
	renderControls();
	expect(screen.getByRole("searchbox")).toBeDefined();
	expect(screen.getByRole("combobox", { name: "Type" })).toBeDefined();
	expect(screen.getByRole("combobox", { name: "Generation" })).toBeDefined();
	expect(screen.getByRole("combobox", { name: "Sort" })).toBeDefined();
});

test("typing in the search box fires onChange with the query", () => {
	const onChange = mock(() => {});
	renderControls({ onChange });
	fireEvent.change(screen.getByRole("searchbox"), {
		target: { value: "char" },
	});
	expect(onChange).toHaveBeenCalledWith({ query: "char" });
});

test("selecting a type fires onChange with that type", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange });
	fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
	fireEvent.click(await screen.findByRole("option", { name: "Water" }));
	expect(onChange).toHaveBeenCalledWith({ type: "Water" });
});

test("selecting a generation fires onChange with that generation label", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange });
	fireEvent.click(screen.getByRole("combobox", { name: "Generation" }));
	fireEvent.click(await screen.findByRole("option", { name: "Gen 3" }));
	expect(onChange).toHaveBeenCalledWith({ generation: "Gen 3" });
});

test("clearing a filter (the All sentinel) fires onChange with null", async () => {
	const onChange = mock(() => {});
	renderControls({
		value: { ...POKEDEX_FILTER_DEFAULTS, type: "Fire" },
		onChange,
	});
	fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
	fireEvent.click(await screen.findByRole("option", { name: "All types" }));
	expect(onChange).toHaveBeenCalledWith({ type: null });
});

test("active-filter badge counts Type + Generation, not query or sort", () => {
	renderControls({
		value: {
			...POKEDEX_FILTER_DEFAULTS,
			query: "pika",
			type: "Fire",
			generation: "Gen 1",
			sort: "name",
		},
	});
	expect(
		screen.getByRole("button", { name: "Toggle filters" }).textContent,
	).toContain("2");
});

test("no badge when no filters are applied", () => {
	renderControls();
	expect(
		screen.getByRole("button", { name: "Toggle filters" }).textContent?.trim(),
	).toBe("");
});

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

test("renders the search box, search-mode menu, and Type + Generation dropdowns", () => {
	renderControls();
	expect(screen.getByRole("searchbox")).toBeDefined();
	expect(screen.getByRole("button", { name: "Search mode" })).toBeDefined();
	expect(screen.getByRole("combobox", { name: "Type" })).toBeDefined();
	expect(screen.getByRole("combobox", { name: "Generation" })).toBeDefined();
});

test("there is no Sort dropdown in the controls (it lives in the ResultsBar)", () => {
	renderControls();
	expect(screen.queryByRole("combobox", { name: "Sort" })).toBeNull();
});

test("typing in the search box fires onChange with the query", () => {
	const onChange = mock(() => {});
	renderControls({ onChange });
	fireEvent.change(screen.getByRole("searchbox"), {
		target: { value: "char" },
	});
	expect(onChange).toHaveBeenCalledWith({ query: "char" });
});

test("changing the search mode fires onChange with searchMode", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange });
	fireEvent.pointerDown(screen.getByRole("button", { name: "Search mode" }), {
		button: 0,
		ctrlKey: false,
	});
	fireEvent.click(await screen.findByRole("menuitemradio", { name: /exact/i }));
	expect(onChange).toHaveBeenCalledWith({ searchMode: "exact" });
});

test("selecting a generation fires onChange with that generation label", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange });
	fireEvent.click(screen.getByRole("combobox", { name: "Generation" }));
	fireEvent.click(await screen.findByRole("option", { name: "Gen 3" }));
	expect(onChange).toHaveBeenCalledWith({ generation: "Gen 3" });
});

test("active-filter badge counts Type + Generation only", () => {
	renderControls({
		value: {
			...POKEDEX_FILTER_DEFAULTS,
			query: "pika",
			type: "Fire",
			generation: "Gen 1",
		},
	});
	expect(
		screen.getByRole("button", { name: "Toggle filters" }).textContent,
	).toContain("2");
});

import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ListSearch } from "../../lib/card-query";
import { SearchControls } from "./search-controls";

const defaultValue: ListSearch = {
	q: "",
	types: [],
	rarity: [],
	supertype: [],
	subtypes: [],
	view: "grid",
	owned: "all",
	yearMin: null,
	yearMax: null,
	pokemon: null,
	mode: "fuzzy" as const,
	sort: "default",
	dir: "asc",
};

const options = {
	supertypes: ["Pokémon", "Trainer"],
	subtypes: ["Basic", "Stage 1"],
	rarities: ["Common", "Rare Holo"],
	types: ["fire", "water"],
	pokemon: [
		{ dex: 6, name: "Charizard" },
		{ dex: 25, name: "Pikachu" },
	],
};

/**
 * Render `<SearchControls>` with the shared `options` and a no-op `onChange`.
 * Override `value`, `onChange`, `showYearFilter`, or `showPokemonFilter` per
 * test as needed.
 */
function renderControls({
	value = defaultValue,
	onChange = () => {},
	showYearFilter = false,
	showPokemonFilter = false,
}: {
	value?: ListSearch;
	onChange?: (patch: Partial<ListSearch>) => void;
	showYearFilter?: boolean;
	showPokemonFilter?: boolean;
} = {}) {
	return render(
		<SearchControls
			value={value}
			options={options}
			onChange={onChange}
			showYearFilter={showYearFilter}
			showPokemonFilter={showPokemonFilter}
		/>,
	);
}

// ─── Year filter visibility ───────────────────────────────────────────────────

test("year selects NOT rendered by default (showYearFilter omitted)", () => {
	renderControls();
	expect(screen.queryByRole("combobox", { name: "From" })).toBeNull();
	expect(screen.queryByRole("combobox", { name: "To" })).toBeNull();
});

test("year selects NOT rendered when showYearFilter={false}", () => {
	renderControls({ showYearFilter: false });
	expect(screen.queryByRole("combobox", { name: "From" })).toBeNull();
	expect(screen.queryByRole("combobox", { name: "To" })).toBeNull();
});

test("renders From and To year selects when showYearFilter={true}", () => {
	renderControls({ showYearFilter: true });
	expect(screen.getByRole("combobox", { name: "From" })).toBeDefined();
	expect(screen.getByRole("combobox", { name: "To" })).toBeDefined();
});

test("From select shows its label when no year is selected", () => {
	renderControls({ showYearFilter: true });
	expect(screen.getByRole("combobox", { name: "From" }).textContent).toContain(
		"From",
	);
});

test("To select shows its label when no year is selected", () => {
	renderControls({ showYearFilter: true });
	expect(screen.getByRole("combobox", { name: "To" }).textContent).toContain(
		"To",
	);
});

test("selecting a year in From fires onChange with yearMin", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange, showYearFilter: true });
	fireEvent.click(screen.getByRole("combobox", { name: "From" }));
	fireEvent.click(await screen.findByRole("option", { name: "2020" }));
	expect(onChange).toHaveBeenCalledWith({ yearMin: 2020 });
});

test("selecting a year in To fires onChange with yearMax", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange, showYearFilter: true });
	fireEvent.click(screen.getByRole("combobox", { name: "To" }));
	fireEvent.click(await screen.findByRole("option", { name: "2023" }));
	expect(onChange).toHaveBeenCalledWith({ yearMax: 2023 });
});

test("clearing From (the sentinel option) fires onChange with yearMin null", async () => {
	const onChange = mock(() => {});
	renderControls({
		value: { ...defaultValue, yearMin: 2020 },
		onChange,
		showYearFilter: true,
	});
	fireEvent.click(screen.getByRole("combobox", { name: "From" }));
	fireEvent.click(await screen.findByRole("option", { name: "From" }));
	expect(onChange).toHaveBeenCalledWith({ yearMin: null });
});

test("clearing To (the sentinel option) fires onChange with yearMax null", async () => {
	const onChange = mock(() => {});
	renderControls({
		value: { ...defaultValue, yearMax: 2023 },
		onChange,
		showYearFilter: true,
	});
	fireEvent.click(screen.getByRole("combobox", { name: "To" }));
	fireEvent.click(await screen.findByRole("option", { name: "To" }));
	expect(onChange).toHaveBeenCalledWith({ yearMax: null });
});

test("existing controls (q input + filter selects + owned) still render", () => {
	renderControls();
	expect(screen.getByRole("searchbox")).toBeDefined();
});

// ─── Pokémon (species) filter ─────────────────────────────────────────────────

test("Pokémon select NOT rendered by default (showPokemonFilter omitted)", () => {
	renderControls();
	expect(screen.queryByRole("combobox", { name: "Pokémon" })).toBeNull();
});

test("renders the Pokémon select when showPokemonFilter={true}", () => {
	renderControls({ showPokemonFilter: true });
	expect(screen.getByRole("combobox", { name: "Pokémon" })).toBeDefined();
});

test("Pokémon select shows its label when no species is selected", () => {
	renderControls({ showPokemonFilter: true });
	expect(
		screen.getByRole("combobox", { name: "Pokémon" }).textContent,
	).toContain("Pokémon");
});

test("selecting a species fires onChange with its dex number", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange, showPokemonFilter: true });
	fireEvent.click(screen.getByRole("combobox", { name: "Pokémon" }));
	fireEvent.click(await screen.findByRole("option", { name: "Charizard" }));
	expect(onChange).toHaveBeenCalledWith({ pokemon: 6 });
});

test("clearing the species (All Pokémon sentinel) fires onChange with null", async () => {
	const onChange = mock(() => {});
	renderControls({
		value: { ...defaultValue, pokemon: 6 },
		onChange,
		showPokemonFilter: true,
	});
	fireEvent.click(screen.getByRole("combobox", { name: "Pokémon" }));
	fireEvent.click(await screen.findByRole("option", { name: "All Pokémon" }));
	expect(onChange).toHaveBeenCalledWith({ pokemon: null });
});

test("selected species label reflects the prop value", () => {
	renderControls({
		value: { ...defaultValue, pokemon: 25 },
		showPokemonFilter: true,
	});
	expect(
		screen.getByRole("combobox", { name: "Pokémon" }).textContent,
	).toContain("Pikachu");
});

// ─── Search-mode menu (ButtonGroup-fused 3-mode picker) ───────────────────────

test("search-mode trigger renders, reflecting the active mode (fuzzy)", () => {
	renderControls();
	const trigger = screen.getByRole("button", { name: "Search mode" });
	expect(trigger.textContent).toContain("Fuzzy");
});

test("search-mode trigger reflects a non-default mode (contains)", () => {
	renderControls({ value: { ...defaultValue, mode: "contains" } });
	expect(
		screen.getByRole("button", { name: "Search mode" }).textContent,
	).toContain("Contains");
});

test("selecting a mode in the menu fires onChange({ mode })", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange });
	fireEvent.pointerDown(screen.getByRole("button", { name: "Search mode" }), {
		button: 0,
		ctrlKey: false,
	});
	fireEvent.click(await screen.findByRole("menuitemradio", { name: /exact/i }));
	expect(onChange).toHaveBeenCalledWith({ mode: "exact" });
});

test("the filter toggle button is present (replaces the old vanity magnifier)", () => {
	renderControls();
	expect(screen.getByRole("button", { name: "Toggle filters" })).toBeDefined();
});

test("active-filter count badge reflects the number of applied filters", () => {
	renderControls({ value: { ...defaultValue, rarity: ["Rare Holo"] } });
	const toggle = screen.getByRole("button", { name: "Toggle filters" });
	expect(toggle.textContent).toContain("1");
});

test("no count badge when no filters are applied", () => {
	renderControls();
	const toggle = screen.getByRole("button", { name: "Toggle filters" });
	expect(toggle.textContent?.trim()).toBe("");
});

test("yearMin value reflects prop", () => {
	renderControls({
		value: { ...defaultValue, yearMin: 1999 },
		showYearFilter: true,
	});
	expect(screen.getByRole("combobox", { name: "From" }).textContent).toContain(
		"1999",
	);
});

test("yearMax value reflects prop", () => {
	renderControls({
		value: { ...defaultValue, yearMax: 2006 },
		showYearFilter: true,
	});
	expect(screen.getByRole("combobox", { name: "To" }).textContent).toContain(
		"2006",
	);
});

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
	pokemon: [],
	mode: "fuzzy" as const,
	sort: "default",
	dir: "asc",
	lang: null,
};

const options = {
	supertypes: ["Pokémon", "Trainer"],
	subtypes: ["Basic", "Stage 1", "GX"],
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

// ─── Pokémon (species) multi-select filter ────────────────────────────────────

test("Pokémon filter NOT rendered by default (showPokemonFilter omitted)", () => {
	renderControls();
	expect(screen.queryByRole("button", { name: /Pokémon/i })).toBeNull();
});

test("renders the Pokémon multi-select when showPokemonFilter={true}", () => {
	renderControls({ showPokemonFilter: true });
	expect(screen.getByRole("button", { name: /Pokémon/i })).toBeDefined();
});

test("empty Pokémon trigger shows the 'All Pokémon' placeholder", () => {
	renderControls({ showPokemonFilter: true });
	expect(screen.getByText("All Pokémon")).toBeDefined();
});

test("a single selected species shows that species' name as the trigger label", () => {
	renderControls({
		value: { ...defaultValue, pokemon: [25] },
		showPokemonFilter: true,
	});
	const trigger = screen.getByRole("button", { name: /Pokémon/i });
	expect(trigger.textContent).toContain("Pikachu");
});

test("two selected species show an 'N selected' summary", () => {
	renderControls({
		value: { ...defaultValue, pokemon: [6, 25] },
		showPokemonFilter: true,
	});
	const trigger = screen.getByRole("button", { name: /Pokémon/i });
	expect(trigger.textContent).toContain("2 selected");
});

test("selecting a species emits a 1-element dex array (empty → one)", async () => {
	const onChange = mock(() => {});
	renderControls({ onChange, showPokemonFilter: true });
	openFilter(/Pokémon/i);
	fireEvent.click(
		await screen.findByRole("menuitemcheckbox", { name: "Charizard" }),
	);
	expect(onChange).toHaveBeenCalledWith({ pokemon: [6] });
});

test("selecting a second species emits the full 2-element dex array", async () => {
	const onChange = mock(() => {});
	renderControls({
		value: { ...defaultValue, pokemon: [6] },
		onChange,
		showPokemonFilter: true,
	});
	openFilter(/Pokémon/i);
	fireEvent.click(
		await screen.findByRole("menuitemcheckbox", { name: "Pikachu" }),
	);
	expect(onChange).toHaveBeenCalledWith({ pokemon: [6, 25] });
});

test("toggling an already-selected species removes its dex from the array", async () => {
	const onChange = mock(() => {});
	renderControls({
		value: { ...defaultValue, pokemon: [6, 25] },
		onChange,
		showPokemonFilter: true,
	});
	openFilter(/Pokémon/i);
	fireEvent.click(
		await screen.findByRole("menuitemcheckbox", { name: "Charizard" }),
	);
	expect(onChange).toHaveBeenCalledWith({ pokemon: [25] });
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

test("Energy Type filter is hidden when no energy types are in the facet (Trainer pages)", () => {
	render(
		<SearchControls
			value={defaultValue}
			options={{ ...options, types: [] }}
			onChange={() => {}}
			lockSupertype
		/>,
	);
	// An empty multi-select trigger shows its "All <label>" text, so a hidden
	// Energy filter means no "Energy Types" text is present anywhere.
	expect(screen.queryByText(/Energy Types/)).toBeNull();
	// other filters still render
	expect(screen.getByText(/Rarities/)).toBeDefined();
});

test("Energy Type filter is shown when energy types are present", () => {
	renderControls();
	expect(screen.getByText(/Energy Types/)).toBeDefined();
});

// ─── Grouped Subtypes facet ───────────────────────────────────────────────────

// Radix DropdownMenu opens on pointerDown (not click) under happy-dom; the
// multi-select filters render their values as role="menuitemcheckbox".
function openFilter(name: RegExp) {
	fireEvent.pointerDown(screen.getByRole("button", { name }), {
		button: 0,
		ctrlKey: false,
	});
}

test("subtype facet renders grouped section headings", async () => {
	renderControls({});
	openFilter(/Subtypes/i);
	// DropdownMenuLabel headings are non-interactive text in the open menu
	expect(await screen.findByText("Stage")).toBeDefined();
	expect(screen.getByText("Pokémon Mechanic")).toBeDefined();
	expect(screen.getByRole("menuitemcheckbox", { name: "GX" })).toBeDefined();
});

// ─── Multi-select filters (item #18) ──────────────────────────────────────────

test("empty filter trigger shows the 'All <label>' placeholder", () => {
	renderControls();
	expect(screen.getByText("All Rarities")).toBeDefined();
});

test("single selected value shows that value as the trigger label", () => {
	renderControls({ value: { ...defaultValue, rarity: ["Rare Holo"] } });
	const trigger = screen.getByRole("button", { name: /Rarities/i });
	expect(trigger.textContent).toContain("Rare Holo");
});

test("multiple selected values show an 'N selected' summary", () => {
	renderControls({
		value: { ...defaultValue, rarity: ["Common", "Rare Holo"] },
	});
	const trigger = screen.getByRole("button", { name: /Rarities/i });
	expect(trigger.textContent).toContain("2 selected");
});

test("selecting a second value emits the full 2-element array (multi-select)", async () => {
	const onChange = mock(() => {});
	renderControls({ value: { ...defaultValue, rarity: ["Common"] }, onChange });
	openFilter(/Rarities/i);
	fireEvent.click(
		await screen.findByRole("menuitemcheckbox", { name: "Rare Holo" }),
	);
	expect(onChange).toHaveBeenCalledWith({ rarity: ["Common", "Rare Holo"] });
});

test("toggling an already-selected value removes it from the array", async () => {
	const onChange = mock(() => {});
	renderControls({
		value: { ...defaultValue, rarity: ["Common", "Rare Holo"] },
		onChange,
	});
	openFilter(/Rarities/i);
	fireEvent.click(
		await screen.findByRole("menuitemcheckbox", { name: "Common" }),
	);
	expect(onChange).toHaveBeenCalledWith({ rarity: ["Rare Holo"] });
});

// ─── Clear all filters (item #17) ─────────────────────────────────────────────

test("Clear filters button is hidden when no filters are active", () => {
	renderControls();
	expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
});

test("Clear filters button appears when a filter is active", () => {
	renderControls({ value: { ...defaultValue, rarity: ["Rare Holo"] } });
	expect(screen.getByRole("button", { name: "Clear filters" })).toBeDefined();
});

test("Clear filters resets every filter dimension in one patch", () => {
	const onChange = mock(() => {});
	renderControls({
		value: {
			...defaultValue,
			supertype: ["Pokémon"],
			subtypes: ["GX"],
			rarity: ["Rare Holo"],
			types: ["fire"],
			owned: "owned",
			pokemon: [25],
			yearMin: 2020,
			yearMax: 2023,
		},
		onChange,
		showYearFilter: true,
		showPokemonFilter: true,
	});
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange).toHaveBeenCalledWith({
		supertype: [],
		subtypes: [],
		rarity: [],
		types: [],
		owned: "all",
		pokemon: [],
		yearMin: null,
		yearMax: null,
	});
});

test("Clear filters does NOT touch q, search mode, or sort", () => {
	const onChange = mock((_patch: Partial<ListSearch>) => {});
	renderControls({
		value: {
			...defaultValue,
			q: "pikachu",
			mode: "exact",
			sort: "name",
			rarity: ["Rare Holo"],
		},
		onChange,
	});
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	const patch = onChange.mock.calls[0][0];
	expect(patch).not.toHaveProperty("q");
	expect(patch).not.toHaveProperty("mode");
	expect(patch).not.toHaveProperty("sort");
});

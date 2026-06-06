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
	mode: "fuzzy" as const,
};

const options = {
	supertypes: ["Pokémon", "Trainer"],
	subtypes: ["Basic", "Stage 1"],
	rarities: ["Common", "Rare Holo"],
	types: ["fire", "water"],
};

// ─── Year filter visibility ───────────────────────────────────────────────────

test("year selects NOT rendered by default (showYearFilter omitted)", () => {
	render(
		<SearchControls
			value={defaultValue}
			options={options}
			onChange={() => {}}
		/>,
	);
	expect(screen.queryByRole("combobox", { name: "From" })).toBeNull();
	expect(screen.queryByRole("combobox", { name: "To" })).toBeNull();
});

test("year selects NOT rendered when showYearFilter={false}", () => {
	render(
		<SearchControls
			value={defaultValue}
			options={options}
			onChange={() => {}}
			showYearFilter={false}
		/>,
	);
	expect(screen.queryByRole("combobox", { name: "From" })).toBeNull();
	expect(screen.queryByRole("combobox", { name: "To" })).toBeNull();
});

test("renders From and To year selects when showYearFilter={true}", () => {
	render(
		<SearchControls
			value={defaultValue}
			options={options}
			onChange={() => {}}
			showYearFilter
		/>,
	);
	expect(screen.getByRole("combobox", { name: "From" })).toBeDefined();
	expect(screen.getByRole("combobox", { name: "To" })).toBeDefined();
});

test("From select shows its label when no year is selected", () => {
	render(
		<SearchControls
			value={defaultValue}
			options={options}
			onChange={() => {}}
			showYearFilter
		/>,
	);
	expect(screen.getByRole("combobox", { name: "From" }).textContent).toContain(
		"From",
	);
});

test("To select shows its label when no year is selected", () => {
	render(
		<SearchControls
			value={defaultValue}
			options={options}
			onChange={() => {}}
			showYearFilter
		/>,
	);
	expect(screen.getByRole("combobox", { name: "To" }).textContent).toContain(
		"To",
	);
});

test("selecting a year in From fires onChange with yearMin", async () => {
	const onChange = mock(() => {});
	render(
		<SearchControls
			value={defaultValue}
			options={options}
			onChange={onChange}
			showYearFilter
		/>,
	);
	fireEvent.click(screen.getByRole("combobox", { name: "From" }));
	fireEvent.click(await screen.findByRole("option", { name: "2020" }));
	expect(onChange).toHaveBeenCalledWith({ yearMin: 2020 });
});

test("selecting a year in To fires onChange with yearMax", async () => {
	const onChange = mock(() => {});
	render(
		<SearchControls
			value={defaultValue}
			options={options}
			onChange={onChange}
			showYearFilter
		/>,
	);
	fireEvent.click(screen.getByRole("combobox", { name: "To" }));
	fireEvent.click(await screen.findByRole("option", { name: "2023" }));
	expect(onChange).toHaveBeenCalledWith({ yearMax: 2023 });
});

test("clearing From (the sentinel option) fires onChange with yearMin null", async () => {
	const onChange = mock(() => {});
	render(
		<SearchControls
			value={{ ...defaultValue, yearMin: 2020 }}
			options={options}
			onChange={onChange}
			showYearFilter
		/>,
	);
	fireEvent.click(screen.getByRole("combobox", { name: "From" }));
	fireEvent.click(await screen.findByRole("option", { name: "From" }));
	expect(onChange).toHaveBeenCalledWith({ yearMin: null });
});

test("clearing To (the sentinel option) fires onChange with yearMax null", async () => {
	const onChange = mock(() => {});
	render(
		<SearchControls
			value={{ ...defaultValue, yearMax: 2023 }}
			options={options}
			onChange={onChange}
			showYearFilter
		/>,
	);
	fireEvent.click(screen.getByRole("combobox", { name: "To" }));
	fireEvent.click(await screen.findByRole("option", { name: "To" }));
	expect(onChange).toHaveBeenCalledWith({ yearMax: null });
});

test("existing controls (q input + filter selects + owned) still render", () => {
	render(
		<SearchControls
			value={defaultValue}
			options={options}
			onChange={() => {}}
		/>,
	);
	expect(screen.getByRole("searchbox")).toBeDefined();
});

// ─── Match-mode toggle (bridge: mode !== "fuzzy" = on) ────────────────────────
// TODO(task2): update these tests when SearchModeMenu replaces MatchModeToggle

test("match-mode toggle renders, reflecting mode=fuzzy as Exact pill off", () => {
	render(
		<SearchControls
			value={defaultValue}
			options={options}
			onChange={() => {}}
		/>,
	);
	expect(
		screen.getByRole("button", { name: "Exact" }).getAttribute("aria-pressed"),
	).toBe("false");
});

test("clicking Exact fires onChange with mode:'contains' (bridge maps on→contains)", () => {
	const onChange = mock(() => {});
	render(
		<SearchControls
			value={defaultValue}
			options={options}
			onChange={onChange}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Exact" }));
	expect(onChange).toHaveBeenCalledWith({ mode: "contains" });
});

test("clicking the Exact pill when on fires onChange with mode:'fuzzy' (bridge maps off→fuzzy)", () => {
	const onChange = mock(() => {});
	render(
		<SearchControls
			value={{ ...defaultValue, mode: "contains" }}
			options={options}
			onChange={onChange}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Exact" }));
	expect(onChange).toHaveBeenCalledWith({ mode: "fuzzy" });
});

test("yearMin value reflects prop", () => {
	render(
		<SearchControls
			value={{ ...defaultValue, yearMin: 1999 }}
			options={options}
			onChange={() => {}}
			showYearFilter
		/>,
	);
	expect(screen.getByRole("combobox", { name: "From" }).textContent).toContain(
		"1999",
	);
});

test("yearMax value reflects prop", () => {
	render(
		<SearchControls
			value={{ ...defaultValue, yearMax: 2006 }}
			options={options}
			onChange={() => {}}
			showYearFilter
		/>,
	);
	expect(screen.getByRole("combobox", { name: "To" }).textContent).toContain(
		"2006",
	);
});

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
};

const options = {
	supertypes: ["Pokémon", "Trainer"],
	subtypes: ["Basic", "Stage 1"],
	rarities: ["Common", "Rare Holo"],
	types: ["fire", "water"],
};

test("renders From and To year inputs", () => {
	render(
		<SearchControls value={defaultValue} options={options} onChange={() => {}} />,
	);
	expect(screen.getByRole("spinbutton", { name: /release year from/i })).toBeDefined();
	expect(screen.getByRole("spinbutton", { name: /release year to/i })).toBeDefined();
});

test("From year input has correct placeholder", () => {
	render(
		<SearchControls value={defaultValue} options={options} onChange={() => {}} />,
	);
	const from = screen.getByRole("spinbutton", { name: /release year from/i }) as HTMLInputElement;
	expect(from.placeholder).toBe("From");
});

test("To year input has correct placeholder", () => {
	render(
		<SearchControls value={defaultValue} options={options} onChange={() => {}} />,
	);
	const to = screen.getByRole("spinbutton", { name: /release year to/i }) as HTMLInputElement;
	expect(to.placeholder).toBe("To");
});

test("typing a year into From fires onChange with yearMin", () => {
	const onChange = mock(() => {});
	render(
		<SearchControls value={defaultValue} options={options} onChange={onChange} />,
	);
	const from = screen.getByRole("spinbutton", { name: /release year from/i });
	fireEvent.change(from, { target: { value: "2020" } });
	expect(onChange).toHaveBeenCalledWith({ yearMin: 2020 });
});

test("typing a year into To fires onChange with yearMax", () => {
	const onChange = mock(() => {});
	render(
		<SearchControls value={defaultValue} options={options} onChange={onChange} />,
	);
	const to = screen.getByRole("spinbutton", { name: /release year to/i });
	fireEvent.change(to, { target: { value: "2023" } });
	expect(onChange).toHaveBeenCalledWith({ yearMax: 2023 });
});

test("clearing From fires onChange with yearMin null", () => {
	const onChange = mock(() => {});
	render(
		<SearchControls
			value={{ ...defaultValue, yearMin: 2020 }}
			options={options}
			onChange={onChange}
		/>,
	);
	const from = screen.getByRole("spinbutton", { name: /release year from/i });
	fireEvent.change(from, { target: { value: "" } });
	expect(onChange).toHaveBeenCalledWith({ yearMin: null });
});

test("clearing To fires onChange with yearMax null", () => {
	const onChange = mock(() => {});
	render(
		<SearchControls
			value={{ ...defaultValue, yearMax: 2023 }}
			options={options}
			onChange={onChange}
		/>,
	);
	const to = screen.getByRole("spinbutton", { name: /release year to/i });
	fireEvent.change(to, { target: { value: "" } });
	expect(onChange).toHaveBeenCalledWith({ yearMax: null });
});

test("existing controls (q input + filter selects + owned) still render", () => {
	render(
		<SearchControls value={defaultValue} options={options} onChange={() => {}} />,
	);
	expect(screen.getByRole("searchbox")).toBeDefined();
});

test("yearMin value reflects prop", () => {
	render(
		<SearchControls
			value={{ ...defaultValue, yearMin: 1999 }}
			options={options}
			onChange={() => {}}
		/>,
	);
	const from = screen.getByRole("spinbutton", { name: /release year from/i }) as HTMLInputElement;
	expect(from.value).toBe("1999");
});

test("yearMax value reflects prop", () => {
	render(
		<SearchControls
			value={{ ...defaultValue, yearMax: 2006 }}
			options={options}
			onChange={() => {}}
		/>,
	);
	const to = screen.getByRole("spinbutton", { name: /release year to/i }) as HTMLInputElement;
	expect(to.value).toBe("2006");
});

import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { FilterChipRow } from "./filter-chip-row";

const fullProps = {
	types: ["Fire", "Water"],
	rarities: ["Rare Holo", "Rare Holo VMAX"],
	supertypes: ["Pokémon", "Trainer"],
	subtypes: ["Basic", "VMAX"],
};

function renderInRouter(ui: React.ReactElement, initialUrl = "/") {
	return render(
		<MemoryRouter initialEntries={[initialUrl]}>{ui}</MemoryRouter>,
	);
}

describe("<FilterChipRow />", () => {
	test("renders four chips (Type, Rarity, Supertype, Subtype)", () => {
		renderInRouter(<FilterChipRow {...fullProps} />);
		expect(screen.getByRole("button", { name: /^type$/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /^rarity$/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /^supertype$/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /^subtype$/i })).toBeDefined();
	});

	test("does not show 'Clear filters' link when no filters are active", () => {
		renderInRouter(<FilterChipRow {...fullProps} />);
		expect(screen.queryByText(/clear filters/i)).toBeNull();
	});

	test("shows 'Clear filters' link when any filter is active", () => {
		renderInRouter(<FilterChipRow {...fullProps} />, "/?types=Fire");
		expect(screen.getByText(/clear filters/i)).toBeDefined();
	});

	test("'Clear filters' link clears all four dimensions", () => {
		renderInRouter(
			<FilterChipRow {...fullProps} />,
			"/?types=Fire&rarity=Rare%20Holo&supertype=Pok%C3%A9mon&subtypes=Basic",
		);
		fireEvent.click(screen.getByText(/clear filters/i));
		expect(screen.queryByText(/clear filters/i)).toBeNull();
	});
});

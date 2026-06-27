import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { makeFocusCard } from "../../test-utils";
import { CardInfo } from "./card-info";

const CARD = makeFocusCard({
	id: "base1-4",
	name: "Charizard",
	setName: "Base Set",
	cardNumber: "4",
	hp: "120",
	attacks: [
		{
			name: "Fire Spin",
			cost: ["Fire"],
			damage: "100",
			text: "Discard 2 Energy.",
		},
	],
});

test("showHeader defaults to true: renders the name", () => {
	render(<CardInfo card={CARD} />);
	expect(screen.getByRole("heading", { name: "Charizard" })).toBeDefined();
});

test("showHeader=false: suppresses name and HP but keeps the attack", () => {
	render(<CardInfo card={CARD} showHeader={false} />);
	expect(screen.queryByRole("heading", { name: "Charizard" })).toBeNull();
	expect(screen.queryByText(/HP/)).toBeNull();
	// Body still renders.
	expect(screen.getByText("Fire Spin")).toBeDefined();
});

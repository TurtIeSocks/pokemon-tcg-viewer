import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { makeFocusCard } from "../../test-utils";
import { CardHeading, CardInfo } from "./card-info";

const CARD = makeFocusCard({
	id: "base1-4",
	name: "Charizard",
	setName: "Base Set",
	cardNumber: "4",
	hp: "120",
	rarity: "Rare Holo",
	attacks: [
		{
			name: "Fire Spin",
			cost: ["Fire"],
			damage: "100",
			text: "Discard 2 Energy.",
		},
	],
});

test("CardInfo renders the attack body", () => {
	render(<CardInfo card={CARD} />);
	expect(screen.getByText("Fire Spin")).toBeDefined();
});

test("CardHeading renders the name, set · #, and rarity", () => {
	render(<CardHeading card={CARD} />);
	expect(screen.getByRole("heading", { name: "Charizard" })).toBeDefined();
	expect(screen.getByText(/Base Set · #4/)).toBeDefined();
	expect(screen.getByText(/Rare Holo/)).toBeDefined();
});

test("CardInfo lists the printings when variantsDetailed is present", () => {
	const { container } = render(
		<CardInfo
			card={makeFocusCard({
				variantsDetailed: [
					{
						variantId: "a",
						type: "holo",
						subtype: "unlimited",
						size: "standard",
						stamp: null,
					},
					{
						variantId: "b",
						type: "holo",
						subtype: "shadowless",
						size: "standard",
						stamp: ["1st-edition"],
					},
				],
			})}
		/>,
	);
	expect(container.textContent).toContain("Printings");
	expect(container.textContent).toContain("Unlimited · Holo");
	expect(container.textContent).toContain("1st Edition · Shadowless · Holo");
});

test("CardInfo omits the printings line when absent", () => {
	const { container } = render(<CardInfo card={makeFocusCard({})} />);
	expect(container.textContent).not.toContain("Printings");
});

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

test("CardInfo dedupes printings that humanize to the same label", () => {
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
					// Different variantId, identical printing identity -> one chip.
					{
						variantId: "b",
						type: "holo",
						subtype: "unlimited",
						size: "standard",
						stamp: null,
					},
				],
			})}
		/>,
	);
	const chips = [...container.querySelectorAll('[class*="r-pill"]')].filter(
		(el) => /Unlimited · Holo/.test(el.textContent ?? ""),
	);
	expect(chips.length).toBe(1);
});

test("weakness/resistance render as type glyphs (icon), not spelled out", () => {
	const { container } = render(
		<CardInfo
			card={makeFocusCard({
				weaknesses: [{ type: "Psychic", value: "×2" }],
				resistances: [{ type: "Fighting", value: "-30" }],
			})}
		/>,
	);
	// The type is shown as an EnergyIcon (role="img", a11y name = the type)…
	expect(screen.getByRole("img", { name: "Psychic" })).toBeDefined();
	expect(screen.getByRole("img", { name: "Fighting" })).toBeDefined();
	// …with the value still visible, but never the spelled-out "Psychic ×2".
	expect(container.textContent).toContain("×2");
	expect(container.textContent).toContain("-30");
	expect(container.textContent).not.toContain("Psychic ×2");
});

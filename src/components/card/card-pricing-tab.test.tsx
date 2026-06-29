import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { makeFocusCard } from "../../test-utils";
import { CardPricingTab } from "./card-pricing-tab";

const CARD = makeFocusCard({ id: "base1-4", name: "Charizard" });

test("renders null while PRICING_ENABLED is false", () => {
	const { container } = render(<CardPricingTab card={CARD} />);
	expect(container.firstChild).toBeNull();
});

test("pending mode also renders null while PRICING_ENABLED is false", () => {
	const { container } = render(<CardPricingTab card={CARD} pending />);
	expect(container.firstChild).toBeNull();
});

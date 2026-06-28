import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { makeFocusCard } from "../../test-utils";
import { CardPricingTab } from "./card-pricing-tab";

const CARD = makeFocusCard({ id: "base1-4", name: "Charizard" });

test("renders the market-prices and price-history sections", () => {
	render(<CardPricingTab card={CARD} />);
	expect(screen.getByText(/market prices/i)).toBeDefined();
	expect(screen.getByLabelText(/price history/i)).toBeDefined();
	expect(screen.getByText(/coming soon/i)).toBeDefined();
});

test("pending shows a price shimmer instead of the price panel", () => {
	const { container } = render(<CardPricingTab card={CARD} pending />);
	// Shimmer skeletons are aria-hidden.
	expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
});

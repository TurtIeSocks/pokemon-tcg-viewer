import { afterEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { PricesBlob } from "@/lib/corpus/price-types";
import {
	resetPricesRuntimeForTests,
	usePricesRuntime,
} from "@/store/corpus/prices-runtime";
import { makeFocusCard } from "../../test-utils";
import { CardPricingTab } from "./card-pricing-tab";

const CARD = makeFocusCard({
	id: "base1-4",
	name: "Charizard",
	cardNumber: "4",
});

function seed(cards: PricesBlob["cards"]) {
	usePricesRuntime.setState({
		byId: new Map(Object.entries(cards)),
		meta: {
			date: "2026-07-03",
			sources: { tp: "2026-07-03", cm: "2026-07-02" },
			fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
}

afterEach(async () => {
	await resetPricesRuntimeForTests();
});

test("renders the market-prices section with live price lines", () => {
	seed({
		"base1-4": { tp: { H: [72034, 53499] }, cm: [50168, 27674, 40096, 56391] },
	});
	render(<CardPricingTab card={CARD} />);
	expect(screen.getByText("Market prices")).toBeDefined();
	expect(screen.getByText("$720.34")).toBeTruthy();
});

test("renders the price-history section as a coming-soon placeholder", () => {
	seed({
		"base1-4": { tp: { H: [72034, 53499] } },
	});
	render(<CardPricingTab card={CARD} />);
	expect(screen.getByText("Price history")).toBeDefined();
	expect(screen.getByText(/Price history\. Coming soon\./i)).toBeDefined();
});

test("pending mode shows the price ghost instead of live prices", () => {
	seed({
		"base1-4": { tp: { H: [72034, 53499] } },
	});
	const { container } = render(<CardPricingTab card={CARD} pending />);
	expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
	expect(screen.queryByText("$720.34")).toBeNull();
});

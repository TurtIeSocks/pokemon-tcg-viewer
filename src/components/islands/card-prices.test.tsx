import { afterEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { PricesBlob } from "@/lib/corpus/price-types";
import {
	resetPricesRuntimeForTests,
	usePricesRuntime,
} from "@/store/corpus/prices-runtime";
import { makeFocusCard } from "@/test-utils";
import { CardPrices } from "./card-prices";

const card = makeFocusCard({
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

test("renders a price line per source for a priced card", () => {
	seed({
		"base1-4": { tp: { H: [72034, 53499] }, cm: [50168, 27674, 40096, 56391] },
	});
	render(<CardPrices card={card} />);
	expect(screen.getByText("$720.34")).toBeTruthy();
	expect(screen.getByText("€501.68")).toBeTruthy();
});

test("shows the mandated TCGplayer attribution when a tcgplayer line renders", () => {
	seed({ "base1-4": { tp: { H: [72034, 53499] } } });
	render(<CardPrices card={card} />);
	expect(
		screen.getByText(/not endorsed or certified by TCGplayer/i),
	).toBeTruthy();
});

test("renders nothing extra for a card absent from the blob", () => {
	seed({ "other-1": { tp: { H: [100, 90] } } });
	const { container } = render(<CardPrices card={card} />);
	expect(container.querySelector("a")).toBeNull();
});

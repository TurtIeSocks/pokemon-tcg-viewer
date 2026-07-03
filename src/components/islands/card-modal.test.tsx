// card-modal.test.tsx
import { afterEach, beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import {
	resetPricesRuntimeForTests,
	usePricesRuntime,
} from "../../store/corpus/prices-runtime";
import {
	makeFocusCard,
	renderInRouter,
	seedCorpusFor,
	setupUserlandTest,
} from "../../test-utils";
import { CardModal } from "./card-modal";

const CARD = makeFocusCard({
	id: "base1-4",
	name: "Charizard",
	setName: "Base Set",
	cardNumber: "4",
	attacks: [
		{ name: "Fire Spin", cost: ["Fire"], damage: "100", text: "Discard 2." },
	],
});

beforeEach(async () => {
	seedCorpusFor(CARD);
	await setupUserlandTest();
});

afterEach(async () => {
	await resetPricesRuntimeForTests();
});

test("renders the cockpit with a tablist", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} tab="details" />,
	);
	expect(screen.getByRole("tablist")).toBeDefined();
	expect(
		screen.getByRole("tab", { name: "Details" }).getAttribute("aria-selected"),
	).toBe("true");
});

test("tab='details' shows the Details body", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} tab="details" />,
	);
	expect(screen.getByText("Fire Spin")).toBeDefined();
});

test("tab='pricing' shows the market-prices section", async () => {
	usePricesRuntime.setState({
		byId: new Map(Object.entries({ "base1-4": { tp: { H: [72034, 53499] } } })),
		meta: {
			date: "2026-07-03",
			sources: { tp: "2026-07-03", cm: "2026-07-02" },
			fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} tab="pricing" />,
	);
	// PRICING_ENABLED = true — the pricing pane renders live prices, so:
	//   - the market-prices heading IS visible
	//   - the details body (Fire Spin attack) is NOT shown on this tab
	expect(screen.getByText(/market prices/i)).toBeDefined();
	expect(screen.queryByText("Fire Spin")).toBeNull();
});

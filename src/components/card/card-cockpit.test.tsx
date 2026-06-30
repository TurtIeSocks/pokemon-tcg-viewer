import { beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { addStack } from "../../store/userland/userland-store";
import {
	makeFocusCard,
	renderInRouter,
	seedCorpusFor,
	setupUserlandTest,
} from "../../test-utils";
import { CardCockpit } from "./card-cockpit";

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

beforeEach(async () => {
	seedCorpusFor(CARD);
	await setupUserlandTest();
});

test("Details tab shows the attack body", async () => {
	await renderInRouter(
		<CardCockpit card={CARD} tab="details" onTabChange={() => {}} />,
	);
	expect(screen.getByText("Fire Spin")).toBeDefined();
});

test("Collection tab shows the StackManager; details body hidden", async () => {
	await addStack("base1-4");
	await renderInRouter(
		<CardCockpit card={CARD} tab="collection" onTabChange={() => {}} />,
	);
	expect(screen.getByRole("button", { name: /add stack/i })).toBeDefined();
	// Attacks (the Details body) are not shown on the Collection tab.
	expect(screen.queryByText("Fire Spin")).toBeNull();
});

test("renders Details and Collection folder tabs; Pricing hidden", async () => {
	await renderInRouter(
		<CardCockpit card={CARD} tab="details" onTabChange={() => {}} />,
	);
	expect(screen.getByRole("tab", { name: "Details" })).toBeDefined();
	expect(screen.getByRole("tab", { name: "Collection" })).toBeDefined();
	// Pricing is hidden while PRICING_ENABLED = false.
	expect(screen.queryByRole("tab", { name: "Pricing" })).toBeNull();
});

test("pricing tab coerces to Details while pricing is disabled", async () => {
	await renderInRouter(
		<CardCockpit card={CARD} tab="pricing" onTabChange={() => {}} />,
	);
	// PRICING_ENABLED = false → the pricing tab is hidden and falls back to
	// the Details pane rather than a blank panel.
	expect(screen.getByText("Fire Spin")).toBeDefined();
	expect(screen.queryByText(/market prices/i)).toBeNull();
});

test("clicking the Collection tab calls onTabChange('collection')", async () => {
	const onTabChange = mock((_: string) => {});
	await renderInRouter(
		<CardCockpit card={CARD} tab="details" onTabChange={onTabChange} />,
	);
	fireEvent.click(screen.getByRole("tab", { name: "Collection" }));
	expect(onTabChange.mock.calls[0][0]).toBe("collection");
});

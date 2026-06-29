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

test("Details tab shows card data; rail shows the name", async () => {
	await renderInRouter(
		<CardCockpit
			card={CARD}
			crossLinks={[]}
			tab="details"
			onTabChange={() => {}}
		/>,
	);
	expect(screen.getByText("Fire Spin")).toBeDefined();
	// Rail name (the cockpit renders the name once, in the rail).
	expect(screen.getByRole("heading", { name: "Charizard" })).toBeDefined();
});

test("Collection tab shows the StackManager; name still present on the rail", async () => {
	await addStack("base1-4");
	await renderInRouter(
		<CardCockpit
			card={CARD}
			crossLinks={[]}
			tab="collection"
			onTabChange={() => {}}
		/>,
	);
	expect(screen.getByRole("button", { name: /add stack/i })).toBeDefined();
	expect(screen.getByRole("heading", { name: "Charizard" })).toBeDefined();
	// Rail identity persists: set·# and rarity show on every tab.
	expect(screen.getByText(/Base Set · #4/)).toBeDefined();
	expect(screen.getByText(/Rare Holo/)).toBeDefined();
	// Attacks (Details body) are NOT shown on the Collection tab.
	expect(screen.queryByText("Fire Spin")).toBeNull();
	// HP moved to the Details pane header — absent on Collection.
	expect(screen.queryByText(/120/)).toBeNull();
});

test("Details pane leads with the descriptor + HP header; rail keeps rarity", async () => {
	await renderInRouter(
		<CardCockpit
			card={CARD}
			crossLinks={[]}
			tab="details"
			onTabChange={() => {}}
		/>,
	);
	// HP now lives in the Details pane header (moved off the rail).
	expect(screen.getByText(/120/)).toBeDefined();
	// Rarity stays on the persistent rail.
	expect(screen.getByText(/Rare Holo/)).toBeDefined();
});

test("Pricing tab renders null (pricing disabled)", async () => {
	await renderInRouter(
		<CardCockpit
			card={CARD}
			crossLinks={[]}
			tab="pricing"
			onTabChange={() => {}}
		/>,
	);
	// PRICING_ENABLED = false — the pricing pane returns null.
	expect(screen.queryByText(/market prices/i)).toBeNull();
	// Rail persists rarity even when the pane body is empty.
	expect(screen.getByText(/Rare Holo/)).toBeDefined();
});

test("clicking the Collection tab calls onTabChange('collection')", async () => {
	const onTabChange = mock((_: string) => {});
	await renderInRouter(
		<CardCockpit
			card={CARD}
			crossLinks={[]}
			tab="details"
			onTabChange={onTabChange}
		/>,
	);
	fireEvent.click(screen.getByRole("tab", { name: "Collection" }));
	expect(onTabChange.mock.calls[0][0]).toBe("collection");
});

test("unowned card shows 'Add to Vault' on the rail across tabs", async () => {
	await renderInRouter(
		<CardCockpit
			card={CARD}
			crossLinks={[]}
			tab="pricing"
			onTabChange={() => {}}
		/>,
	);
	expect(screen.getByRole("button", { name: /add to vault/i })).toBeDefined();
});

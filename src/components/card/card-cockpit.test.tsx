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
	// Attacks (Details body) are NOT shown on the Collection tab.
	expect(screen.queryByText("Fire Spin")).toBeNull();
});

test("Pricing tab shows the pricing pane", async () => {
	await renderInRouter(
		<CardCockpit
			card={CARD}
			crossLinks={[]}
			tab="pricing"
			onTabChange={() => {}}
		/>,
	);
	expect(screen.getByText(/market prices/i)).toBeDefined();
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

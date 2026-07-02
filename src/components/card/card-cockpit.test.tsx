import { beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { addStack } from "../../store/userland/userland-store";
import {
	makeCorpusCard,
	makeFocusCard,
	renderInRouter,
	seedCorpus,
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

test("focus art uses the corpus image, not the live-fetched fallback", async () => {
	// The live TCGdex fetch derives a pokemontcg.io English fallback for a JP card
	// with no native scan; the corpus holds the authoritative tcgcsv JP image. The
	// focus view must render the corpus image (matching the grid), not the fallback.
	seedCorpus([
		makeCorpusCard({
			id: "neo3-1",
			setId: "neo3",
			number: "1",
			imageBase: null,
			imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/575223_400w.jpg",
			imageUrlSmall:
				"https://tcgplayer-cdn.tcgplayer.com/product/575223_200w.jpg",
		}),
	]);
	const focus = makeFocusCard({
		id: "neo3-1",
		setId: "neo3",
		cardNumber: "1",
		imageUrl: "https://images.pokemontcg.io/neo3/1_hires.png", // stale live fallback
	});
	await renderInRouter(
		<CardCockpit card={focus} tab="details" onTabChange={() => {}} />,
	);
	const html = document.body.innerHTML;
	expect(html).toContain("575223"); // corpus tcgplayer image
	expect(html).not.toContain("pokemontcg.io"); // never the English fallback
});

test("clicking the Collection tab calls onTabChange('collection')", async () => {
	const onTabChange = mock((_: string) => {});
	await renderInRouter(
		<CardCockpit card={CARD} tab="details" onTabChange={onTabChange} />,
	);
	fireEvent.click(screen.getByRole("tab", { name: "Collection" }));
	expect(onTabChange.mock.calls[0][0]).toBe("collection");
});

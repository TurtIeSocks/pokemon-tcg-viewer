import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import {
	resetHistoryRuntimeForTests,
	setHistoryFetchersForTests,
} from "../../store/corpus/history-runtime";
import {
	resetPricesRuntimeForTests,
	usePricesRuntime,
} from "../../store/corpus/prices-runtime";
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
	// The Pricing tab mounts <CardHistory>, whose mount effect calls the real
	// loadSetHistory(card.setId). Without a fetcher stub it hits the live
	// Worker over the network and leaves the shared history-runtime module
	// state (statusBySet/bySet) populated after this file ends, which starves
	// later test files' loadSetHistory calls (they see status "loading"/"ready"
	// and short-circuit before ever calling their own injected fetcher).
	setHistoryFetchersForTests({
		fetchHistory: async () => {
			throw new Response(null, { status: 503 });
		},
	});
});

afterEach(async () => {
	await resetPricesRuntimeForTests();
	await resetHistoryRuntimeForTests();
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
	expect(screen.getByRole("button", { name: /add card/i })).toBeDefined();
	// Attacks (the Details body) are not shown on the Collection tab.
	expect(screen.queryByText("Fire Spin")).toBeNull();
});

test("renders Details, Collection, and Pricing folder tabs", async () => {
	await renderInRouter(
		<CardCockpit card={CARD} tab="details" onTabChange={() => {}} />,
	);
	expect(screen.getByRole("tab", { name: "Details" })).toBeDefined();
	expect(screen.getByRole("tab", { name: "Collection" })).toBeDefined();
	// Pricing is visible now that PRICING_ENABLED = true.
	expect(screen.getByRole("tab", { name: "Pricing" })).toBeDefined();
});

test("pricing tab shows the live market-prices section", async () => {
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
		<CardCockpit card={CARD} tab="pricing" onTabChange={() => {}} />,
	);
	expect(screen.getByText(/market prices/i)).toBeDefined();
	expect(screen.queryByText("Fire Spin")).toBeNull();
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

// owned-cards-grid.test.tsx
import { afterEach, beforeEach, expect, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { clearCorpus } from "../../store/corpus/corpus-store";
import { addStack } from "../../store/userland/userland-store";
import {
	makeCorpusCard,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { OwnedCardsGrid } from "./owned-cards-grid";

const testCard = makeCorpusCard({
	id: "base1-4",
	name: "Charizard",
	imageUrl: "https://example.com/charizard.png",
	imageUrlSmall: "https://example.com/charizard-sm.png",
	number: "4",
});

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

/**
 * OwnedCardTile renders a TanStack `<Link>` (to the card manage face), which
 * needs a router context. Wrap the grid in a minimal in-memory router.
 */
const renderGrid = () => renderInRouter(<OwnedCardsGrid />);

beforeEach(async () => {
	await setupUserlandTest();
	// Pre-seed an empty corpus index so OwnedCardsGrid's loadCorpus() effect
	// early-returns instead of hitting the real /corpus network endpoint, which
	// would pollute the shared fake-indexeddb + corpus runtime for other files.
	await clearCorpus();
	seedCorpus([]);
});

afterEach(() => {
	useCorpusRuntime.setState({ index: null, loading: false });
	useStore.setState({ sets: null, setsFetchedAt: null });
});

test("renders empty state when no owned cards", async () => {
	await renderGrid();
	expect(screen.getByText(/nothing here yet/i)).toBeDefined();
});

test("renders without crashing", async () => {
	const { container } = await renderGrid();
	expect(container).toBeDefined();
});

test("renders a tile when a card is owned with seeded corpus + sets", async () => {
	seedCorpus([testCard]);
	useStore.setState({ sets: [testSet], setsFetchedAt: Date.now() });
	await addStack(testCard.id);

	await renderGrid();
	// Owned tile is now a Link to the card's manage face.
	expect(
		screen.getByRole("link", { name: "Manage stacks of Charizard" }),
	).toBeDefined();
});

test("renders ×2 badge when two stacks are owned", async () => {
	seedCorpus([testCard]);
	useStore.setState({ sets: [testSet], setsFetchedAt: Date.now() });
	await addStack(testCard.id);
	await addStack(testCard.id);

	await renderGrid();
	expect(screen.getByText("×2")).toBeDefined();
});

test("changing sort key re-renders grid without crashing", async () => {
	seedCorpus([testCard]);
	useStore.setState({ sets: [testSet], setsFetchedAt: Date.now() });
	await addStack(testCard.id);

	await renderGrid();
	// The sort select trigger shows the current value; click it then change option
	const selectTrigger = screen.getByRole("combobox");
	fireEvent.click(selectTrigger);
	// Select "Date acquired"
	const option = await screen.findByText(/date acquired/i);
	fireEvent.click(option);
	// Grid still shows the card
	expect(
		screen.getByRole("link", { name: "Manage stacks of Charizard" }),
	).toBeDefined();
});

test("clicking asc/desc toggle re-renders grid without crashing", async () => {
	seedCorpus([testCard]);
	useStore.setState({ sets: [testSet], setsFetchedAt: Date.now() });
	await addStack(testCard.id);

	await renderGrid();
	const toggleBtn = screen.getByRole("button", { name: /sort descending/i });
	fireEvent.click(toggleBtn);
	// Now label flips
	expect(screen.getByRole("button", { name: /sort ascending/i })).toBeDefined();
	// Card still present
	expect(
		screen.getByRole("link", { name: "Manage stacks of Charizard" }),
	).toBeDefined();
});

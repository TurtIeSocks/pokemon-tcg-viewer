// owned-cards-grid.test.tsx
import { afterEach, beforeEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { clearCorpus } from "../../store/corpus/corpus-store";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	addCopy,
	resetUserlandForTests,
	setUserlandRepos,
} from "../../store/userland/userland-store";
import { OwnedCardsGrid } from "./owned-cards-grid";

const testCard: CorpusCard = {
	id: "base1-4",
	name: "Charizard",
	imageUrl: "https://example.com/charizard.png",
	imageUrlSmall: "https://example.com/charizard-sm.png",
	supertype: "Pokémon",
	setId: "base1",
	number: "4",
};

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	// Pre-seed an empty corpus index so OwnedCardsGrid's loadCorpus() effect
	// early-returns instead of hitting the real /corpus network endpoint, which
	// would pollute the shared fake-indexeddb + corpus runtime for other files.
	await clearCorpus();
	useCorpusRuntime.setState({ index: buildIndex([]), loading: false });
});

afterEach(() => {
	useCorpusRuntime.setState({ index: null, loading: false });
	useStore.setState({ sets: null, setsFetchedAt: null });
});

test("renders empty state when no owned cards", async () => {
	render(<OwnedCardsGrid />);
	expect(screen.getByText(/your binder is empty/i)).toBeDefined();
});

test("renders without crashing", () => {
	const { container } = render(<OwnedCardsGrid />);
	expect(container).toBeDefined();
});

test("renders a tile when a card is owned with seeded corpus + sets", async () => {
	// Seed corpus index with the test card
	useCorpusRuntime.setState({ index: buildIndex([testCard]), loading: false });
	// Seed sets
	useStore.setState({ sets: [testSet], setsFetchedAt: Date.now() });
	// Add a copy of the card
	await addCopy(testCard.id);

	render(<OwnedCardsGrid />);
	// HoloCardIsland under happy-dom renders HoloCard with aria-label={name}
	expect(
		screen.getByRole("button", { name: "Manage copies of Charizard" }),
	).toBeDefined();
});

test("renders ×2 badge when two copies are owned", async () => {
	useCorpusRuntime.setState({ index: buildIndex([testCard]), loading: false });
	useStore.setState({ sets: [testSet], setsFetchedAt: Date.now() });
	await addCopy(testCard.id);
	await addCopy(testCard.id);

	render(<OwnedCardsGrid />);
	expect(screen.getByText("×2")).toBeDefined();
});

import { afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { PokemonSet } from "../api";
import { useStore } from "../store";
import { buildIndex } from "../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../store/corpus/corpus-runtime";
import { BrowsePage } from "./browse-page";

// Mock API calls so no real network requests fire in tests.
mock.module("../api", () => ({
	getCardsBySet: () => Promise.resolve({ cards: [], totalCount: 0 }),
	getCardsByName: () => Promise.resolve({ cards: [], totalCount: 0 }),
	getSets: () => Promise.resolve([]),
	getRarities: () => Promise.resolve([]),
	getTypes: () => Promise.resolve([]),
	getSupertypes: () => Promise.resolve([]),
	getSubtypes: () => Promise.resolve([]),
}));

// Mock Home so we don't pull in its heavy deps (recents store, HoloCard, etc.)
mock.module("./home", () => ({
	Home: () => (
		<div>
			<p>Search a card above, or pick a set from the sidebar.</p>
		</div>
	),
}));

const fixtureSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 102,
	images: { symbol: "", logo: "" },
};

function renderBrowsePage(initialEntries: string[]) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <BrowsePage />,
				children: [{ index: true, element: null }],
			},
		],
		{ initialEntries },
	);
	return render(<RouterProvider router={router} />);
}

afterEach(() => {
	useStore.setState({
		sets: null,
		setsLoading: false,
		setsFetchedAt: null,
		cardsCache: {},
		cardsCacheOrder: [],
	});
	useCorpusRuntime.setState({ index: null });
});

describe("<BrowsePage />", () => {
	test("renders Home at / with empty store (no set, no query)", () => {
		renderBrowsePage(["/"]);
		// Home renders the empty-state hint text.
		expect(screen.getByText(/Search a card above/)).toBeDefined();
	});

	test("renders set content header at /?setId=base1", () => {
		useStore.setState({ sets: [fixtureSet], setsFetchedAt: Date.now() });
		renderBrowsePage(["/?setId=base1"]);
		// Set name appears in the content header.
		expect(screen.getByText("Base Set")).toBeDefined();
		// SearchBar input is present.
		expect(screen.getByRole("textbox")).toBeDefined();
	});

	test("renders search bar for a name query (?q=pikachu)", () => {
		useStore.setState({ sets: [fixtureSet], setsFetchedAt: Date.now() });
		renderBrowsePage(["/?q=pikachu"]);
		expect(screen.getByRole("textbox")).toBeDefined();
		// Result count label reflects the query.
		expect(screen.getByText(/Results for "pikachu"/)).toBeDefined();
	});

	test("set browse renders from the in-memory corpus when ready", async () => {
		useStore.setState({ sets: [fixtureSet], setsFetchedAt: Date.now() });
		useCorpusRuntime.setState({
			index: buildIndex([
				{
					id: "base1-4",
					name: "Charizard",
					imageUrl: "a",
					imageUrlSmall: "b",
					supertype: "Pokémon",
					setId: "base1",
					number: "4",
				},
			]),
		});
		renderBrowsePage(["/?setId=base1"]);
		// The mocked api fetcher returns 0 cards; only the corpus path yields 1.
		// The corpus fetcher resolves async, so use findByText to await the re-render.
		expect(await screen.findByText(/· 1 loaded/)).toBeDefined();
	});
});

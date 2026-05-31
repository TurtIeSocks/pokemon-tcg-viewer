import { afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { PokemonSet } from "../api";
import { useStore } from "../store";
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
	useStore.setState({ sets: null, setsLoading: false, setsFetchedAt: null });
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
});

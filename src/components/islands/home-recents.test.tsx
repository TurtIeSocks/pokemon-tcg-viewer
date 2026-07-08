import { beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store/index";
import { useRecentsStore } from "../../store/recents";
import {
	makeCard,
	makeCorpusCard,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { HomeRecents } from "./home-recents";

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

beforeEach(() => {
	useRecentsStore.setState({ recentSearches: [], recentlyViewed: [] });
});

test("HomeRecents renders nothing when there are no recents", async () => {
	const { container } = await renderInRouter(<HomeRecents />);
	// Empty store → no sections. Component must not throw and renders empty.
	expect(container.querySelectorAll("section").length).toBe(0);
});

test("a recently-viewed card renders the unified mini-nav", async () => {
	await setupUserlandTest();
	seedCorpus([
		makeCorpusCard({
			id: "base1-1",
			name: "Bulbasaur",
			setId: "base1",
			number: "1",
		}),
	]);
	useStore.setState({ sets: [testSet] });
	useRecentsStore.setState({
		recentSearches: [],
		recentlyViewed: [
			makeCard({
				id: "base1-1",
				name: "Bulbasaur",
				setId: "base1",
				cardNumber: "1",
			}),
		],
	});

	await renderInRouter(<HomeRecents />);

	// Recents now match every other grid: the unified mini-nav is present.
	expect(
		await screen.findByRole("button", { name: /expand bulbasaur/i }),
	).toBeDefined();
});

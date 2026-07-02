import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../index";
import { buildIndex } from "./corpus-engine";
import { useSlugIndex } from "./corpus-runtime";
import { useCorpusRuntime } from "./corpus-runtime-store";
import type { CorpusCard } from "./corpus-types";

const westCards: CorpusCard[] = [
	{
		id: "base1-4",
		name: "Charizard",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "base1",
		number: "4",
	},
];

const asiaCards: CorpusCard[] = [
	{
		id: "asia1-1",
		name: "Fushigidane",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "asia1",
		number: "1",
	},
];

const westSet: PokemonSet = {
	id: "base1",
	name: "Base",
	series: "Base",
	releaseDate: "1999",
	total: 1,
	images: {},
};

const asiaSet: PokemonSet = {
	id: "asia1",
	name: "Expansion Pack",
	series: "Original Era",
	releaseDate: "1996",
	total: 1,
	images: {},
};

beforeEach(() => {
	useCorpusRuntime.setState({
		indices: {},
		activeRegion: "west",
		loading: {},
		index: null,
	});
	// West sets via the plain `sets` field (unchanged shape); asia sets via the
	// region-keyed cache -- the two regions' sets are never one combined list in
	// the real client (see sets-slice.ts setsForRegion), only in this fixture's
	// pre-region-split shape.
	useStore.setState({
		sets: [westSet],
		setsByRegion: { west: [westSet], asia: [asiaSet] },
		setsByRegionLoading: {},
	});
});

afterEach(() => {
	useCorpusRuntime.setState({
		indices: {},
		activeRegion: "west",
		loading: {},
		index: null,
	});
	useStore.setState({ sets: null, setsByRegion: {}, setsByRegionLoading: {} });
});

/** Probe component: renders the reactive slug index's card-slug resolution. */
function SlugProbe({ cardId }: { cardId: string }) {
	const idx = useSlugIndex();
	const slug = idx?.cardSlugById.get(cardId) ?? "none";
	return <div data-testid="slug">{slug}</div>;
}

test("useSlugIndex resolves a west set/card slug when west is active", () => {
	useCorpusRuntime.getState().setIndex("west", buildIndex(westCards, "west"));
	act(() => {
		render(<SlugProbe cardId="base1-4" />);
	});
	expect(screen.getByTestId("slug").textContent).toBe("charizard-4");
});

test("useSlugIndex resolves an asia set/card slug once the asia region is active", () => {
	// West stays loaded (as it does in practice — asia loads alongside it), but
	// the active region switches to asia; the slug index must follow the ACTIVE
	// region's index, not fall back to west.
	useCorpusRuntime.getState().setIndex("west", buildIndex(westCards, "west"));
	useCorpusRuntime.getState().setIndex("asia", buildIndex(asiaCards, "asia"));
	useCorpusRuntime.getState().setActiveRegion("asia");

	act(() => {
		render(<SlugProbe cardId="asia1-1" />);
	});
	expect(screen.getByTestId("slug").textContent).toBe("fushigidane-1");

	// And the west-only card is NOT resolvable while asia is active.
	act(() => {
		render(<SlugProbe cardId="base1-4" />);
	});
	expect(
		screen.getAllByTestId("slug").some((el) => el.textContent === "none"),
	).toBe(true);
});

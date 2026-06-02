import { describe, expect, test } from "bun:test";
import type { CorpusCard } from "../store/corpus/corpus-types";
import { cardRouteProps } from "./card-route";
import { buildSlugIndex, resolveCard, type SluggableSet } from "./slug";

const sets: SluggableSet[] = [
	{ id: "base1", name: "Base", series: "Base" },
	{ id: "swsh9", name: "Brilliant Stars", series: "Sword & Shield" },
];

// Two same-named cards in different sets — exercises the per-set card slug.
const cards: CorpusCard[] = [
	{
		id: "base1-4",
		name: "Charizard",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "base1",
		number: "4",
	},
	{
		id: "swsh9-18",
		name: "Charizard",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "swsh9",
		number: "18",
	},
];

const idx = buildSlugIndex(sets, cards);

describe("cardRouteProps", () => {
	test("builds /$series/$set/$card props that resolve back to the same card id", () => {
		const props = cardRouteProps(idx, { id: "swsh9-18", setId: "swsh9" });
		expect(props).not.toBeNull();
		expect(props?.to).toBe("/$series/$set/$card");
		// The link the search/pokemon grid emits must resolve, via the same slug
		// index the detail route uses, to exactly the card that was clicked.
		const p = props?.params as { series: string; set: string; card: string };
		expect(resolveCard(idx, p.series, p.set, p.card)).toBe("swsh9-18");
	});

	test("returns null when the card's set is not in the index", () => {
		expect(cardRouteProps(idx, { id: "xy1-1", setId: "xy1" })).toBeNull();
	});

	test("returns null when the card id is unknown in a known set", () => {
		expect(cardRouteProps(idx, { id: "base1-999", setId: "base1" })).toBeNull();
	});
});

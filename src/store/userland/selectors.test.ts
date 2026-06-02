// src/store/userland/selectors.test.ts
import { expect, test } from "bun:test";
import type { PokemonSet } from "../../server/card-mappers";
import { buildIndex } from "../corpus/corpus-engine";
import type { CorpusCard } from "../corpus/corpus-types";
import { groupByCardId, joinOwnedViews } from "./selectors";
import type { CollectionItem } from "./types";

function item(id: string, cardId: string): CollectionItem {
	return {
		id,
		cardId,
		acquiredAt: 1,
		createdAt: 1,
		pricePaid: null,
		variant: null,
		notes: null,
		condition: null,
		grading: null,
	};
}
function corpusCard(id: string, setId = "base1"): CorpusCard {
	return {
		id,
		name: id,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId,
		number: "1",
	};
}
const base1: PokemonSet = {
	id: "base1",
	name: "Base",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

test("groupByCardId groups copies by cardId", () => {
	const map = groupByCardId([item("1", "a"), item("2", "a"), item("3", "b")]);
	expect(map.get("a")).toHaveLength(2);
	expect(map.get("b")).toHaveLength(1);
});

test("joinOwnedViews returns one HoloCardData per distinct owned card", () => {
	const index = buildIndex([corpusCard("a"), corpusCard("b")]);
	const setsById = new Map([["base1", base1]]);
	const views = joinOwnedViews(
		[item("1", "a"), item("2", "a"), item("3", "b")],
		index,
		setsById,
	);
	expect(views.map((v) => v.id).sort()).toEqual(["a", "b"]);
	expect(views.find((v) => v.id === "a")?.setName).toBe("Base");
});

test("joinOwnedViews skips cards missing from the corpus", () => {
	const index = buildIndex([corpusCard("a")]);
	const views = joinOwnedViews(
		[item("1", "a"), item("2", "ghost")],
		index,
		new Map([["base1", base1]]),
	);
	expect(views.map((v) => v.id)).toEqual(["a"]);
});

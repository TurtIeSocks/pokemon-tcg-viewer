// src/store/userland/selectors.test.ts
import { expect, test } from "bun:test";
import type { PokemonSet } from "../../server/card-mappers";
import { makeCorpusCard, makeStack } from "../../test-utils";
import { buildIndex } from "../corpus/corpus-engine";
import { groupByCardId, joinOwnedViews, sumQuantity } from "./selectors";
import type { Stack } from "./types";

const item = (id: string, cardId: string): Stack => makeStack({ id, cardId });

test("sumQuantity totals quantity across stacks", () => {
	expect(
		sumQuantity([{ quantity: 3 } as Stack, { quantity: 2 } as Stack]),
	).toBe(5);
	expect(sumQuantity([])).toBe(0);
});

const corpusCard = (id: string, setId = "base1") =>
	makeCorpusCard({ id, setId });
const base1: PokemonSet = {
	id: "base1",
	name: "Base",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

test("groupByCardId groups stacks by cardId", () => {
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

import { tallyOwnedBySet } from "./selectors";

test("tallyOwnedBySet tallies distinct cardIds by their set via corpus byId", () => {
	const index = buildIndex([
		corpusCard("base1-1", "base1"),
		corpusCard("base1-2", "base1"),
		corpusCard("xy1-5", "xy1"),
	]);
	const counts = tallyOwnedBySet(["base1-1", "base1-2", "xy1-5"], index);
	expect(counts.get("base1")).toBe(2);
	expect(counts.get("xy1")).toBe(1);
});

test("tallyOwnedBySet skips cardIds absent from the corpus", () => {
	const index = buildIndex([corpusCard("base1-1", "base1")]);
	const counts = tallyOwnedBySet(["base1-1", "ghost-9"], index);
	expect(counts.get("base1")).toBe(1);
	expect([...counts.keys()]).toEqual(["base1"]);
});

import { ownedCardIdSet } from "./selectors";

test("ownedCardIdSet returns distinct cardIds from items record", () => {
	const items = {
		i1: item("i1", "card-a"),
		i2: item("i2", "card-a"),
		i3: item("i3", "card-b"),
	};
	const set = ownedCardIdSet(items);
	expect(set.has("card-a")).toBe(true);
	expect(set.has("card-b")).toBe(true);
	expect(set.size).toBe(2);
});

test("ownedCardIdSet returns empty set for empty items", () => {
	expect(ownedCardIdSet({}).size).toBe(0);
});

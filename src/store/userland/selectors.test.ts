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
		{ west: index },
		setsById,
	);
	expect(views.map((v) => v.id).sort()).toEqual(["a", "b"]);
	expect(views.find((v) => v.id === "a")?.setName).toBe("Base");
});

test("joinOwnedViews skips cards missing from every loaded index", () => {
	const index = buildIndex([corpusCard("a")]);
	const views = joinOwnedViews(
		[item("1", "a"), item("2", "ghost")],
		{ west: index },
		new Map([["base1", base1]]),
	);
	expect(views.map((v) => v.id)).toEqual(["a"]);
});

test("joinOwnedViews includes an owned card that exists ONLY in the asia index (no more silent drop)", () => {
	const west = buildIndex([corpusCard("a")]);
	const asia = buildIndex([corpusCard("sv1a-001", "svjp1")], "asia");
	const setsMap = new Map([
		["base1", base1],
		[
			"svjp1",
			{
				id: "svjp1",
				name: "Scarlet ex",
				series: "SV",
				releaseDate: "2023-01-20",
				total: 78,
				images: { symbol: "", logo: "" },
			},
		],
	]);
	const views = joinOwnedViews(
		[item("1", "a"), item("2", "sv1a-001")],
		{ west, asia },
		setsMap,
	);
	expect(views.map((v) => v.id).sort()).toEqual(["a", "sv1a-001"]);
});

import { tallyOwnedBySet } from "./selectors";

test("tallyOwnedBySet tallies distinct cardIds by their set via corpus byId", () => {
	const index = buildIndex([
		corpusCard("base1-1", "base1"),
		corpusCard("base1-2", "base1"),
		corpusCard("xy1-5", "xy1"),
	]);
	const counts = tallyOwnedBySet(["base1-1", "base1-2", "xy1-5"], {
		west: index,
	});
	expect(counts.get("base1")).toBe(2);
	expect(counts.get("xy1")).toBe(1);
});

test("tallyOwnedBySet skips cardIds absent from every loaded index", () => {
	const index = buildIndex([corpusCard("base1-1", "base1")]);
	const counts = tallyOwnedBySet(["base1-1", "ghost-9"], { west: index });
	expect(counts.get("base1")).toBe(1);
	expect([...counts.keys()]).toEqual(["base1"]);
});

test("tallyOwnedBySet counts an asia-only owned card's set (no more silent drop)", () => {
	const west = buildIndex([corpusCard("base1-1", "base1")]);
	const asia = buildIndex([corpusCard("sv1a-001", "svjp1")], "asia");
	const counts = tallyOwnedBySet(["base1-1", "sv1a-001"], { west, asia });
	expect(counts.get("base1")).toBe(1);
	expect(counts.get("svjp1")).toBe(1);
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

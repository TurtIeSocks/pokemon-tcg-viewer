import { expect, test } from "bun:test";
import type { PokemonSet } from "../../server/card-mappers";
import { makeCorpusCard, makeStack } from "../../test-utils";
import { buildIndex } from "../corpus/corpus-engine";
import { buildCardRows, sortCardRows } from "./card-rows";
import type { Stack } from "./types";

const item = (id: string, cardId: string, over: Partial<Stack> = {}): Stack =>
	makeStack({ id, cardId, acquiredAt: 0, createdAt: 0, ...over });

test("buildCardRows count sums quantity across a card's stacks", () => {
	const index = buildIndex([cc("base1-1", "base1", "1")]);
	const rows = buildCardRows(
		[
			item("a", "base1-1", { quantity: 3 }),
			item("b", "base1-1", { quantity: 2 }),
		],
		{ west: index },
		sets,
	);
	expect(rows).toHaveLength(1);
	expect(rows[0].count).toBe(5);
	expect(rows[0].stacks).toHaveLength(2);
});

const cc = (id: string, setId: string, number: string) =>
	makeCorpusCard({ id, setId, number });
const sets = new Map<string, PokemonSet>([
	[
		"base1",
		{
			id: "base1",
			name: "Base",
			series: "Base",
			releaseDate: "1999-01-09",
			total: 102,
			images: { symbol: "", logo: "" },
		},
	],
	[
		"xy1",
		{
			id: "xy1",
			name: "XY",
			series: "XY",
			releaseDate: "2014-02-05",
			total: 146,
			images: { symbol: "", logo: "" },
		},
	],
]);
const index = buildIndex([
	cc("base1-4", "base1", "4"),
	cc("base1-58", "base1", "58"),
	cc("xy1-1", "xy1", "1"),
]);

test("buildCardRows: one row per card, primary = isPrimary else earliest createdAt, count", () => {
	const rows = buildCardRows(
		[
			item("i1", "base1-4", { createdAt: 100 }),
			item("i2", "base1-4", { createdAt: 50, isPrimary: true }),
		],
		{ west: index },
		sets,
	);
	expect(rows).toHaveLength(1);
	expect(rows[0].count).toBe(2);
	expect(rows[0].primary.id).toBe("i2"); // explicit primary
});

test("buildCardRows: default primary = earliest createdAt when none flagged", () => {
	const rows = buildCardRows(
		[
			item("i1", "base1-4", { createdAt: 100 }),
			item("i2", "base1-4", { createdAt: 50 }),
		],
		{ west: index },
		sets,
	);
	expect(rows[0].primary.id).toBe("i2");
});

test("buildCardRows: an owned card that exists ONLY in the asia index is included (not silently dropped)", () => {
	// Regression test for the Vault silent-drop bug: an owned card whose id is
	// only present in the asia region index must still render when the
	// west+asia indices map is passed in.
	const west = buildIndex([cc("base1-4", "base1", "4")]);
	const asia = buildIndex([cc("sv1a-001", "svjp1", "1")], "asia");
	const asiaSets = new Map(sets);
	asiaSets.set("svjp1", {
		id: "svjp1",
		name: "Scarlet ex",
		series: "SV",
		releaseDate: "2023-01-20",
		total: 78,
		images: { symbol: "", logo: "" },
	});

	const rows = buildCardRows(
		[item("a", "base1-4"), item("b", "sv1a-001")],
		{ west, asia },
		asiaSets,
	);

	expect(rows.map((r) => r.card.id).sort()).toEqual(["base1-4", "sv1a-001"]);
});

test("sortCardRows by set→number, year, price (nulls last), acquired", () => {
	const rows = buildCardRows(
		[
			item("a", "xy1-1", { pricePaid: 5, acquiredAt: 300 }),
			item("b", "base1-58", { pricePaid: null, acquiredAt: 100 }),
			item("c", "base1-4", { pricePaid: 20, acquiredAt: 200 }),
		],
		{ west: index },
		sets,
	);
	expect(sortCardRows(rows, "set", "asc").map((r) => r.card.id)).toEqual([
		"base1-4",
		"base1-58",
		"xy1-1",
	]);
	expect(sortCardRows(rows, "year", "asc").map((r) => r.card.setId)[0]).toBe(
		"base1",
	);
	// price asc: 5,20 then null last
	expect(
		sortCardRows(rows, "price", "asc").map((r) => r.primary.pricePaid),
	).toEqual([5, 20, null]);
	expect(
		sortCardRows(rows, "acquired", "desc").map((r) => r.primary.acquiredAt),
	).toEqual([300, 200, 100]);
});

import { expect, test } from "bun:test";
import type { PokemonSet } from "../../server/card-mappers";
import { buildIndex } from "../corpus/corpus-engine";
import type { CorpusCard } from "../corpus/corpus-types";
import { buildCardRows, sortCardRows } from "./card-rows";
import type { CollectionItem } from "./types";

function item(
	id: string,
	cardId: string,
	over: Partial<CollectionItem> = {},
): CollectionItem {
	return {
		id,
		cardId,
		acquiredAt: 0,
		createdAt: 0,
		pricePaid: null,
		variant: null,
		notes: null,
		condition: null,
		grading: null,
		...over,
	};
}
function cc(id: string, setId: string, number: string): CorpusCard {
	return {
		id,
		name: id,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId,
		number,
	};
}
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
		index,
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
		index,
		sets,
	);
	expect(rows[0].primary.id).toBe("i2");
});

test("sortCardRows by set→number, year, price (nulls last), acquired", () => {
	const rows = buildCardRows(
		[
			item("a", "xy1-1", { pricePaid: 5, acquiredAt: 300 }),
			item("b", "base1-58", { pricePaid: null, acquiredAt: 100 }),
			item("c", "base1-4", { pricePaid: 20, acquiredAt: 200 }),
		],
		index,
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

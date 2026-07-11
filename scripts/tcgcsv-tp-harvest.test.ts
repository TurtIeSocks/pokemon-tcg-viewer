import { expect, test } from "bun:test";
import type { PriceIdsMap } from "../src/lib/corpus/price-types";
import type { TcgcsvProduct } from "./tcgcsv-overlay";
import {
	type GetProductsFn,
	harvestTcgcsvTpIds,
	mergeTpIds,
} from "./tcgcsv-tp-harvest";

const product = (
	productId: number,
	number: string,
	name = "X",
): TcgcsvProduct => ({
	productId,
	name,
	extendedData: [{ name: "Number", value: number }],
});

/** A fake getProducts backed by an in-memory {groupId: products} table. */
const fakeGet =
	(table: Record<number, TcgcsvProduct[]>): GetProductsFn =>
	async (_cat, groupId) =>
		table[groupId] ?? [];

test("matches cards to tcgplayer productIds by exact set+number", async () => {
	const { tpIdByCardId, report } = await harvestTcgcsvTpIds(
		[
			{ id: "sv8-11", setId: "sv8", number: "11" },
			{ id: "sv8-90", setId: "sv8", number: "90" },
		],
		{ sv8: 700 },
		3,
		{
			getProductsFn: fakeGet({
				700: [product(111, "011/086"), product(990, "090/086")],
			}),
		},
	);
	expect(tpIdByCardId.get("sv8-11")).toBe(111);
	expect(tpIdByCardId.get("sv8-90")).toBe(990);
	expect(report.cardsMatched).toBe(2);
	expect(report.setsHarvested).toBe(1);
});

test("normalizes zero-padding both ways (074/086 ↔ 74 ↔ 074)", async () => {
	const { tpIdByCardId } = await harvestTcgcsvTpIds(
		[
			{ id: "a-74", setId: "a", number: "074" },
			{ id: "b-74", setId: "b", number: "74" },
		],
		{ a: 1, b: 2 },
		3,
		{
			getProductsFn: fakeGet({
				1: [product(500, "074/086")],
				2: [product(600, "074/086")],
			}),
		},
	);
	expect(tpIdByCardId.get("a-74")).toBe(500);
	expect(tpIdByCardId.get("b-74")).toBe(600);
});

test("drops ambiguous set+number (two products claim the same key)", async () => {
	const { tpIdByCardId, report } = await harvestTcgcsvTpIds(
		[{ id: "s-1", setId: "s", number: "1" }],
		{ s: 9 },
		3,
		{
			getProductsFn: fakeGet({
				9: [product(100, "001/100"), product(200, "1/100")],
			}),
		},
	);
	expect(tpIdByCardId.has("s-1")).toBe(false);
	expect(report.ambiguousSkipped).toBe(1);
	expect(report.cardsMatched).toBe(0);
});

test("ignores cards whose set is not in the map", async () => {
	const { tpIdByCardId } = await harvestTcgcsvTpIds(
		[
			{ id: "mapped-1", setId: "mapped", number: "1" },
			{ id: "other-1", setId: "other", number: "1" },
		],
		{ mapped: 1 },
		3,
		{ getProductsFn: fakeGet({ 1: [product(42, "001/010")] }) },
	);
	expect(tpIdByCardId.get("mapped-1")).toBe(42);
	expect(tpIdByCardId.has("other-1")).toBe(false);
});

test("counts an unfetchable group without aborting the harvest", async () => {
	const { tpIdByCardId, report } = await harvestTcgcsvTpIds(
		[
			{ id: "ok-1", setId: "ok", number: "1" },
			{ id: "dead-1", setId: "dead", number: "1" },
		],
		{ ok: 1, dead: 2 },
		3,
		{
			getProductsFn: async (_c, groupId) => {
				if (groupId === 2) throw new Error("500");
				return [product(7, "001/010")];
			},
		},
	);
	expect(tpIdByCardId.get("ok-1")).toBe(7);
	expect(report.groupsUnfetched).toBe(1);
	expect(report.setsHarvested).toBe(1);
});

// --- mergeTpIds ------------------------------------------------------------

test("mergeTpIds fills a null tp slot but never overwrites a TCGdex tp id", () => {
	const base: PriceIdsMap = {
		gap: [123, null], // cardmarket only → tp gap to fill
		tcgdexTp: [null, 999], // TCGdex already has tp → keep
	};
	const { map, filled } = mergeTpIds(
		base,
		new Map([
			["gap", 555],
			["tcgdexTp", 111],
		]),
	);
	expect(map.gap).toEqual([123, 555]);
	expect(map.tcgdexTp).toEqual([null, 999]); // untouched
	expect(filled).toBe(1);
});

test("mergeTpIds adds a tcgplayer-only entry for a card with no crosswalk row", () => {
	const { map, filled } = mergeTpIds({}, new Map([["ja-1", 777]]));
	expect(map["ja-1"]).toEqual([null, 777]);
	expect(filled).toBe(1);
});

test("mergeTpIds does not mutate the base map", () => {
	const base: PriceIdsMap = { a: [1, null] };
	mergeTpIds(base, new Map([["a", 2]]));
	expect(base.a).toEqual([1, null]);
});

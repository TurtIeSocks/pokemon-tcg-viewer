import { describe, expect, test } from "bun:test";
import type { PokemonSet } from "@/server/card-mappers";
import type { CorpusCard } from "../corpus/corpus-types";
import { matchScan } from "./match";

// R2: number+total primary key, name tiebreaker; name-only fallback.
const sets = [
	{
		id: "swsh9",
		name: "Brilliant Stars",
		series: "SwSh",
		releaseDate: "2022-02-25",
		printedTotal: 172,
		total: 186,
		images: {},
	},
	{
		id: "sv1",
		name: "Scarlet & Violet",
		series: "SV",
		releaseDate: "2023-03-31",
		printedTotal: 198,
		total: 258,
		images: {},
	},
	{
		id: "sv2",
		name: "Paldea Evolved",
		series: "SV",
		releaseDate: "2023-06-09",
		printedTotal: 193,
		total: 279,
		images: {},
	},
] satisfies PokemonSet[];

const card = (
	id: string,
	name: string,
	number: string,
	setId: string,
): CorpusCard => ({
	id,
	name,
	number,
	setId,
	imageUrl: "",
	imageUrlSmall: "",
	supertype: "Pokémon",
});

const cards = [
	card("sv1-86", "Skiddo", "86", "sv1"),
	card("sv1-205", "Miraidon ex", "205", "sv1"),
	card("sv2-86", "Meowscarada", "86", "sv2"),
	card("swsh9-86", "Flittle", "86", "swsh9"),
	card("swsh9-p1", "Charizard", "SWSH123", "swsh9"),
];

describe("matchScan", () => {
	test("(a) 86/198 + name noise finds the right card first", () => {
		const result = matchScan(
			{ reading: { number: "86", total: 198 }, nameText: "Skidd0" },
			cards,
			sets,
		);
		expect(result.length).toBeGreaterThan(0);
		expect(result[0]?.cardId).toBe("sv1-86");
	});

	test("(b) two sets share printedTotal 198 (only sv1 does here); disambiguate via name among the shared-total pool", () => {
		// sv1 (printedTotal 198) is the only set with total 198 in this fixture, but
		// exercise the tie-break path: garbled name should still surface sv1-86
		// over other same-number cards outside the 198 pool (swsh9-86, sv2-86 use
		// printedTotal 172/193, not 198), proving the number+total filter, not name
		// alone, drives the pool.
		const result = matchScan(
			{ reading: { number: "86", total: 198 }, nameText: "Skiddo" },
			cards,
			sets,
		);
		expect(result[0]?.cardId).toBe("sv1-86");
		expect(result.some((c) => c.cardId === "swsh9-86")).toBe(false);
		expect(result.some((c) => c.cardId === "sv2-86")).toBe(false);
	});

	test("(c) secret rare 205/198 matches via printedTotal even though number > printedTotal", () => {
		const result = matchScan(
			{ reading: { number: "205", total: 198 }, nameText: "Miraidon ex" },
			cards,
			sets,
		);
		expect(result[0]?.cardId).toBe("sv1-205");
	});

	test("(d) promo SWSH123 with total null takes the name-only-within-number path", () => {
		const result = matchScan(
			{ reading: { number: "SWSH123", total: null }, nameText: "Charizard" },
			cards,
			sets,
		);
		expect(result[0]?.cardId).toBe("swsh9-p1");
	});

	test("(d2) promo id number match is case-insensitive", () => {
		const result = matchScan(
			{ reading: { number: "swsh123", total: null }, nameText: "Charizard" },
			cards,
			sets,
		);
		expect(result[0]?.cardId).toBe("swsh9-p1");
	});

	test("(e) no reading, name only, falls back to fuzzy name search over the whole pool", () => {
		const result = matchScan(
			{ reading: null, nameText: "Meowscarada" },
			cards,
			sets,
		);
		expect(result[0]?.cardId).toBe("sv2-86");
	});

	test("(f) garbage input returns empty", () => {
		const result = matchScan({ reading: null, nameText: null }, cards, sets);
		expect(result).toEqual([]);
	});

	test("(f2) garbage name with no reading and no plausible fuzzy match returns empty", () => {
		const result = matchScan(
			{ reading: null, nameText: "zzzzqqqxx" },
			cards,
			sets,
		);
		expect(result).toEqual([]);
	});

	test("(f3) reading with no matching pool returns empty", () => {
		const result = matchScan(
			{ reading: { number: "999", total: 198 }, nameText: "Skiddo" },
			cards,
			sets,
		);
		expect(result).toEqual([]);
	});

	test("caps results at 3 candidates", () => {
		const result = matchScan(
			{ reading: { number: "86", total: 198 }, nameText: null },
			cards,
			sets,
		);
		expect(result.length).toBeLessThanOrEqual(3);
	});

	test("keyed match tolerates a weak/absent name (low floor)", () => {
		const result = matchScan(
			{ reading: { number: "86", total: 198 }, nameText: null },
			cards,
			sets,
		);
		expect(result.some((c) => c.cardId === "sv1-86")).toBe(true);
	});

	test("scores are within [0,1]", () => {
		const result = matchScan(
			{ reading: { number: "86", total: 198 }, nameText: "Skiddo" },
			cards,
			sets,
		);
		for (const c of result) {
			expect(c.score).toBeGreaterThanOrEqual(0);
			expect(c.score).toBeLessThanOrEqual(1);
		}
	});

	test("number canonicalization: leading zeros in a purely numeric reading are stripped for comparison", () => {
		// reading "086" should still match card number "86" once canonicalized.
		const result = matchScan(
			{ reading: { number: "086", total: 198 }, nameText: "Skiddo" },
			cards,
			sets,
		);
		expect(result[0]?.cardId).toBe("sv1-86");
	});

	test("number canonicalization: non-numeric promo ids are uppercased, not zero-stripped", () => {
		const result = matchScan(
			{ reading: { number: "swsh123", total: null }, nameText: null },
			cards,
			sets,
		);
		expect(result.some((c) => c.cardId === "swsh9-p1")).toBe(true);
	});
});

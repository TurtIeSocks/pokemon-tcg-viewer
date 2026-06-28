import { describe, expect, test } from "bun:test";
import {
	filterPokedex,
	GENERATIONS,
	generationOf,
	type PokedexRow,
	spriteUrl,
} from "./pokedex";

describe("spriteUrl", () => {
	test("builds the PokéAPI national-dex sprite URL for a dex number", () => {
		expect(spriteUrl(6)).toBe(
			"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png",
		);
	});
});

describe("GENERATIONS / generationOf", () => {
	test("covers dex 1 through 1025 with no gaps or overlaps", () => {
		expect(GENERATIONS[0].start).toBe(1);
		expect(GENERATIONS.at(-1)?.end).toBe(1025);
		for (let i = 1; i < GENERATIONS.length; i++) {
			expect(GENERATIONS[i].start).toBe(GENERATIONS[i - 1].end + 1);
		}
	});
	test("maps a dex number to its generation label", () => {
		expect(generationOf(6)).toBe("Gen 1");
		expect(generationOf(152)).toBe("Gen 2");
		expect(generationOf(906)).toBe("Gen 9");
	});
	test("returns null out of range", () => {
		expect(generationOf(9999)).toBeNull();
	});
});

describe("filterPokedex", () => {
	const rows: PokedexRow[] = [
		{ dex: 6, name: "charizard", count: 9, type: "Fire" },
		{ dex: 25, name: "pikachu", count: 9, type: "Lightning" },
	];
	test("empty query returns all rows", () => {
		expect(filterPokedex(rows, "")).toHaveLength(2);
	});
	test("matches by name substring, case-insensitive", () => {
		expect(filterPokedex(rows, "Char")).toEqual([rows[0]]);
	});
	test("matches by dex number", () => {
		expect(filterPokedex(rows, "25")).toEqual([rows[1]]);
	});
});

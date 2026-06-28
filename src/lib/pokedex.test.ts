import { describe, expect, test } from "bun:test";
import {
	applyPokedexFilter,
	GENERATIONS,
	generationOf,
	POKEDEX_FILTER_DEFAULTS,
	type PokedexRow,
	pokedexTypeOptions,
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

describe("pokedexTypeOptions", () => {
	test("returns the distinct present types, sorted, dropping nulls", () => {
		const rows: PokedexRow[] = [
			{ dex: 6, name: "charizard", count: 9, type: "Fire" },
			{ dex: 9, name: "blastoise", count: 7, type: "Water" },
			{ dex: 3, name: "venusaur", count: 6, type: "Fire" },
			{ dex: 132, name: "ditto", count: 4, type: null },
		];
		expect(pokedexTypeOptions(rows)).toEqual(["Fire", "Water"]);
	});
});

describe("applyPokedexFilter", () => {
	const rows: PokedexRow[] = [
		{ dex: 6, name: "charizard", count: 9, type: "Fire" },
		{ dex: 25, name: "pikachu", count: 30, type: "Lightning" },
		{ dex: 152, name: "chikorita", count: 4, type: "Grass" },
	];
	const f = (over: Partial<typeof POKEDEX_FILTER_DEFAULTS> = {}) => ({
		...POKEDEX_FILTER_DEFAULTS,
		...over,
	});

	test("defaults return every row in dex order", () => {
		expect(applyPokedexFilter(rows, f()).map((r) => r.dex)).toEqual([
			6, 25, 152,
		]);
	});
	test("query matches name substring (case-insensitive) or dex number", () => {
		expect(applyPokedexFilter(rows, f({ query: "Char" }))).toEqual([rows[0]]);
		expect(applyPokedexFilter(rows, f({ query: "25" }))).toEqual([rows[1]]);
	});
	test("type filter keeps only that type", () => {
		expect(applyPokedexFilter(rows, f({ type: "Grass" }))).toEqual([rows[2]]);
	});
	test("generation filter keeps only that generation's dex range", () => {
		expect(
			applyPokedexFilter(rows, f({ generation: "Gen 2" })).map((r) => r.dex),
		).toEqual([152]);
	});
	test("sort=name orders alphabetically", () => {
		expect(
			applyPokedexFilter(rows, f({ sort: "name" })).map((r) => r.name),
		).toEqual(["charizard", "chikorita", "pikachu"]);
	});
	test("sort=count orders by card count descending", () => {
		expect(
			applyPokedexFilter(rows, f({ sort: "count" })).map((r) => r.dex),
		).toEqual([25, 6, 152]);
	});
	test("filters compose (type + generation)", () => {
		expect(
			applyPokedexFilter(rows, f({ type: "Fire", generation: "Gen 2" })),
		).toEqual([]);
	});
});

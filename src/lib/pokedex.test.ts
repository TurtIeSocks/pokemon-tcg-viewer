import { describe, expect, test } from "bun:test";
import {
	applyPokedexFilter,
	GENERATIONS,
	generationOf,
	naturalPokedexDir,
	POKEDEX_FILTER_DEFAULTS,
	type PokedexRow,
	pokedexTypeOptions,
	spriteUrl,
	validatePokedexSearch,
} from "./pokedex";

describe("validatePokedexSearch", () => {
	test("empty params return the defaults", () => {
		expect(validatePokedexSearch({})).toEqual(POKEDEX_FILTER_DEFAULTS);
	});
	test("reads every field through verbatim", () => {
		expect(
			validatePokedexSearch({
				query: "char",
				searchMode: "exact",
				type: "Fire",
				generation: "Gen 1",
				sortMode: "count",
				sortDir: "desc",
			}),
		).toEqual({
			query: "char",
			searchMode: "exact",
			type: "Fire",
			generation: "Gen 1",
			sortMode: "count",
			sortDir: "desc",
		});
	});
	test("invalid enum values fall back to defaults", () => {
		const r = validatePokedexSearch({
			searchMode: "bogus",
			sortMode: "bogus",
			sortDir: "bogus",
		});
		expect(r.searchMode).toBe("fuzzy");
		expect(r.sortMode).toBe("dex");
		expect(r.sortDir).toBe("asc");
	});
	test("empty type/generation strings normalize to null", () => {
		const r = validatePokedexSearch({ type: "", generation: "" });
		expect(r.type).toBeNull();
		expect(r.generation).toBeNull();
	});
});

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

	test("defaults return every row in ascending dex order", () => {
		expect(applyPokedexFilter(rows, f()).map((r) => r.dex)).toEqual([
			6, 25, 152,
		]);
	});
	test("fuzzy query matches a near name; numeric query matches by dex", () => {
		expect(applyPokedexFilter(rows, f({ query: "charizar" }))).toEqual([
			rows[0],
		]);
		expect(applyPokedexFilter(rows, f({ query: "25" }))).toEqual([rows[1]]);
	});
	test("exact search mode requires the whole name", () => {
		expect(
			applyPokedexFilter(rows, f({ query: "char", searchMode: "exact" })),
		).toEqual([]);
		expect(
			applyPokedexFilter(rows, f({ query: "charizard", searchMode: "exact" })),
		).toEqual([rows[0]]);
	});
	test("type and generation filters still apply", () => {
		expect(applyPokedexFilter(rows, f({ type: "Grass" }))).toEqual([rows[2]]);
		expect(
			applyPokedexFilter(rows, f({ generation: "Gen 2" })).map((r) => r.dex),
		).toEqual([152]);
	});
	test("sort by name respects direction", () => {
		expect(
			applyPokedexFilter(rows, f({ sortMode: "name", sortDir: "asc" })).map(
				(r) => r.name,
			),
		).toEqual(["charizard", "chikorita", "pikachu"]);
		expect(
			applyPokedexFilter(rows, f({ sortMode: "name", sortDir: "desc" })).map(
				(r) => r.name,
			),
		).toEqual(["pikachu", "chikorita", "charizard"]);
	});
	test("sort by count desc lists most cards first; asc least first", () => {
		expect(
			applyPokedexFilter(rows, f({ sortMode: "count", sortDir: "desc" })).map(
				(r) => r.dex,
			),
		).toEqual([25, 6, 152]);
		expect(
			applyPokedexFilter(rows, f({ sortMode: "count", sortDir: "asc" })).map(
				(r) => r.dex,
			),
		).toEqual([152, 6, 25]);
	});
	test("sort by dex desc reverses the order", () => {
		expect(
			applyPokedexFilter(rows, f({ sortMode: "dex", sortDir: "desc" })).map(
				(r) => r.dex,
			),
		).toEqual([152, 25, 6]);
	});
});

describe("naturalPokedexDir", () => {
	test("count defaults to desc, others to asc", () => {
		expect(naturalPokedexDir("count")).toBe("desc");
		expect(naturalPokedexDir("dex")).toBe("asc");
		expect(naturalPokedexDir("name")).toBe("asc");
	});
});

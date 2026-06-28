import { describe, expect, test } from "bun:test";
import type { HoloCardData } from "../components/holo-card";
import type { PokemonListEntry } from "./card-mappers";
import { buildPokedex, dexByName, nameByDex } from "./pokemon-dex";

const list: PokemonListEntry[] = [
	{ name: "bulbasaur", url: "https://pokeapi.co/api/v2/pokemon/1/" },
	{ name: "charizard", url: "https://pokeapi.co/api/v2/pokemon/6/" },
	{ name: "mr-mime", url: "https://pokeapi.co/api/v2/pokemon/122/" },
];

describe("dexByName", () => {
	test("maps a species name to its dex number", () => {
		expect(dexByName(list, "charizard")).toBe(6);
		expect(dexByName(list, "mr-mime")).toBe(122);
	});
	test("is case-insensitive", () => {
		expect(dexByName(list, "Charizard")).toBe(6);
	});
	test("returns null for unknown name", () => {
		expect(dexByName(list, "missingno")).toBeNull();
	});
});

describe("nameByDex", () => {
	test("maps a dex number back to the species name", () => {
		expect(nameByDex(list, 6)).toBe("charizard");
	});
	test("returns null for unknown dex", () => {
		expect(nameByDex(list, 9999)).toBeNull();
	});
});

function card(
	id: string,
	dex: number[] | undefined,
	types?: string[],
): HoloCardData {
	return {
		id,
		name: id,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId: "x",
		setName: "X",
		setSeries: "",
		cardNumber: "1",
		nationalPokedexNumbers: dex,
		types,
	};
}

describe("buildPokedex", () => {
	const list: PokemonListEntry[] = [
		{ name: "bulbasaur", url: "https://pokeapi.co/api/v2/pokemon/1/" },
		{ name: "charizard", url: "https://pokeapi.co/api/v2/pokemon/6/" },
		{ name: "mew", url: "https://pokeapi.co/api/v2/pokemon/151/" },
	];

	test("emits one row per species with >=1 card, counts cards, sorts by dex", () => {
		const rows = buildPokedex(
			[
				card("c1", [6], ["Fire"]),
				card("c2", [6], ["Fire"]),
				card("c3", [1], ["Grass"]),
			],
			list,
		);
		expect(rows.map((r) => r.dex)).toEqual([1, 6]); // mew (151) excluded, sorted
		expect(rows.find((r) => r.dex === 6)?.count).toBe(2);
		expect(rows.find((r) => r.dex === 6)?.type).toBe("Fire");
	});

	test("type is the most-frequent first type; null when no types", () => {
		const rows = buildPokedex(
			[
				card("a", [6], ["Fire"]),
				card("b", [6], ["Dragon"]),
				card("c", [6], ["Fire"]),
				card("d", [1], undefined),
			],
			list,
		);
		expect(rows.find((r) => r.dex === 6)?.type).toBe("Fire");
		expect(rows.find((r) => r.dex === 1)?.type).toBeNull();
	});

	test("a multi-dex card counts toward every species it lists", () => {
		const rows = buildPokedex([card("m", [1, 6], ["Grass"])], list);
		expect(rows.find((r) => r.dex === 1)?.count).toBe(1);
		expect(rows.find((r) => r.dex === 6)?.count).toBe(1);
	});
});

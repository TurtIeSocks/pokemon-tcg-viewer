import { describe, expect, test } from "bun:test";
import type { PokemonListEntry } from "./card-mappers";
import { dexByName, nameByDex } from "./pokemon-dex";

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

import { describe, expect, test } from "bun:test";
import type { PokemonListEntry } from "../server/card-mappers";
import { pokemonNameByDex } from "./pokemon-name";

const list: PokemonListEntry[] = [
	{ name: "bulbasaur", url: "" },
	{ name: "ivysaur", url: "" },
	{ name: "venusaur", url: "" },
];

describe("pokemonNameByDex", () => {
	test("returns the display name for a valid pokédex number (1-indexed)", () => {
		expect(pokemonNameByDex(list, 1)).toBe("Bulbasaur");
		expect(pokemonNameByDex(list, 3)).toBe("Venusaur");
	});

	test("returns null for out-of-range numbers", () => {
		expect(pokemonNameByDex(list, 0)).toBeNull();
		expect(pokemonNameByDex(list, 4)).toBeNull();
		expect(pokemonNameByDex(list, -1)).toBeNull();
	});

	test("returns null when list is null (not yet loaded)", () => {
		expect(pokemonNameByDex(null, 1)).toBeNull();
	});

	test("title-cases hyphenated names (e.g. mr-mime)", () => {
		const withHyphen: PokemonListEntry[] = [{ name: "mr-mime", url: "" }];
		expect(pokemonNameByDex(withHyphen, 1)).toBe("Mr Mime");
	});
});

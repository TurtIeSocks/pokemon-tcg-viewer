import { describe, expect, test } from "bun:test";
import type { HoloCardData } from "../components/holo-card";
import { deriveFacets } from "./set-facets";

const c = (over: Partial<HoloCardData>): HoloCardData => ({
	id: "x",
	imageUrl: "l",
	imageUrlSmall: "s",
	name: "n",
	supertype: "Pokémon",
	setId: "swsh9",
	setName: "BS",
	setSeries: "S&S",
	cardNumber: "1",
	...over,
});

describe("deriveFacets", () => {
	test("returns distinct sorted values per dimension that actually occur", () => {
		const f = deriveFacets([
			c({
				supertype: "Pokémon",
				rarity: "Rare",
				subtypes: ["Stage 2", "VSTAR"],
				types: ["Fire"],
			}),
			c({ supertype: "Trainer", rarity: "Uncommon", subtypes: ["Item"] }),
			c({
				supertype: "Pokémon",
				rarity: "Rare",
				subtypes: ["VSTAR"],
				types: ["Water"],
			}),
		]);
		expect(f.supertypes).toEqual(["Pokémon", "Trainer"]);
		expect(f.rarities).toEqual(["Rare", "Uncommon"]);
		expect(f.subtypes).toEqual(["Item", "Stage 2", "VSTAR"]);
		expect(f.types).toEqual(["Fire", "Water"]);
	});

	test("omits dimensions with no values (empty arrays, not undefined)", () => {
		const f = deriveFacets([c({ supertype: "Pokémon" })]);
		expect(f.types).toEqual([]);
		expect(f.rarities).toEqual([]);
	});
});

describe("deriveFacets pokemon", () => {
	const dexName = (n: number): string | null =>
		({ 6: "charizard", 25: "pikachu", 112: "rhydon" })[n] ?? null;

	test("distinct species from cards, alphabetized, labeled via resolver", () => {
		const f = deriveFacets(
			[
				c({ name: "Brock's Rhydon", nationalPokedexNumbers: [112] }),
				c({ name: "Rhydon", nationalPokedexNumbers: [112] }),
				c({ name: "Charizard", nationalPokedexNumbers: [6] }),
			],
			dexName,
		);
		expect(f.pokemon).toEqual([
			{ dex: 6, name: "Charizard" },
			{ dex: 112, name: "Rhydon" },
		]);
	});

	test("cards without a dex contribute no species option", () => {
		const f = deriveFacets(
			[c({ name: "Potion", supertype: "Trainer" })],
			dexName,
		);
		expect(f.pokemon).toEqual([]);
	});

	test("multi-dex card contributes an option per species", () => {
		const f = deriveFacets(
			[c({ name: "Pikachu & Zekrom", nationalPokedexNumbers: [25, 644] })],
			dexName,
		);
		expect(f.pokemon.map((p) => p.dex).sort((a, b) => a - b)).toEqual([
			25, 644,
		]);
		expect(f.pokemon.find((p) => p.dex === 25)?.name).toBe("Pikachu");
		expect(f.pokemon.find((p) => p.dex === 644)?.name).toBe("#644");
	});

	test("no resolver → #<dex> labels", () => {
		const f = deriveFacets([
			c({ name: "Rhydon", nationalPokedexNumbers: [112] }),
		]);
		expect(f.pokemon).toEqual([{ dex: 112, name: "#112" }]);
	});
});

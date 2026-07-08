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

describe("deriveFacets ids", () => {
	const dexName = (n: number): string | null =>
		({ 6: "charizard", 25: "pikachu", 112: "rhydon" })[n] ?? null;

	test("Pokémon key by dex id (string), labeled via resolver, alphabetized", () => {
		const f = deriveFacets(
			[
				c({ name: "Brock's Rhydon", nationalPokedexNumbers: [112] }),
				c({ name: "Rhydon", nationalPokedexNumbers: [112] }),
				c({ name: "Charizard", nationalPokedexNumbers: [6] }),
			],
			dexName,
		);
		expect(f.ids).toEqual([
			{ id: "6", label: "Charizard", group: "Pokémon" },
			{ id: "112", label: "Rhydon", group: "Pokémon" },
		]);
	});

	test("cards without a dex (Trainers) key by name — a mix of dex + names, grouped by supertype", () => {
		const f = deriveFacets(
			[
				c({ name: "Charizard", nationalPokedexNumbers: [6] }),
				c({ name: "Acerola", supertype: "Trainer" }),
				c({ name: "Barry", supertype: "Trainer" }),
			],
			dexName,
		);
		expect(f.ids).toEqual([
			{ id: "Acerola", label: "Acerola", group: "Trainer" },
			{ id: "Barry", label: "Barry", group: "Trainer" },
			{ id: "6", label: "Charizard", group: "Pokémon" },
		]);
	});

	test("multi-dex card contributes an id per species", () => {
		const f = deriveFacets(
			[c({ name: "Pikachu & Zekrom", nationalPokedexNumbers: [25, 644] })],
			dexName,
		);
		expect(f.ids.map((o) => o.id).sort()).toEqual(["25", "644"]);
		expect(f.ids.find((o) => o.id === "25")?.label).toBe("Pikachu");
		// No resolver entry for 644 → falls back to the card name.
		expect(f.ids.find((o) => o.id === "644")?.label).toBe("Pikachu & Zekrom");
	});

	test("no resolver → card-name label fallback for a dex id", () => {
		const f = deriveFacets([
			c({ name: "Rhydon", nationalPokedexNumbers: [112] }),
		]);
		expect(f.ids).toEqual([{ id: "112", label: "Rhydon", group: "Pokémon" }]);
	});
});

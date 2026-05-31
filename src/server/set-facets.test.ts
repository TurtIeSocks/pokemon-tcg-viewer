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

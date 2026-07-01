import { expect, test } from "bun:test";
import {
	subtypesFromTcgdex,
	supertypeFromCategory,
} from "./tcgdex-card-fields";

test("supertypeFromCategory maps TCGdex category to the accented app supertype", () => {
	expect(supertypeFromCategory("Pokemon")).toBe("Pokémon");
	expect(supertypeFromCategory("Trainer")).toBe("Trainer");
	expect(supertypeFromCategory("Energy")).toBe("Energy");
});

test("subtypesFromTcgdex assembles from stage/trainerType/energyType/suffix", () => {
	expect(subtypesFromTcgdex({ stage: "Stage2" })).toEqual(["Stage2"]);
	// chase card: stage + fused mechanic suffix
	expect(subtypesFromTcgdex({ stage: "Basic", suffix: "TAG TEAM-GX" })).toEqual(
		["Basic", "TAG TEAM-GX"],
	);
	expect(subtypesFromTcgdex({ trainerType: "Supporter" })).toEqual([
		"Supporter",
	]);
	expect(subtypesFromTcgdex({ energyType: "Special" })).toEqual(["Special"]);
	expect(subtypesFromTcgdex({})).toBeUndefined();
});

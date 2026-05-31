import { describe, expect, test } from "bun:test";
import { slugify } from "./slug";

describe("slugify", () => {
	test("lowercases and hyphenates spaces", () => {
		expect(slugify("Sword & Shield")).toBe("sword-shield");
	});
	test("strips diacritics and punctuation", () => {
		expect(slugify("Pokémon GO!")).toBe("pokemon-go");
	});
	test("collapses repeated separators and trims", () => {
		expect(slugify("  Team   Rocket's  Return  ")).toBe("team-rockets-return");
	});
	test("keeps internal digits", () => {
		expect(slugify("Charizard VSTAR 018")).toBe("charizard-vstar-018");
	});
	test("returns empty string for all-punctuation input", () => {
		expect(slugify("—&—")).toBe("");
	});
});

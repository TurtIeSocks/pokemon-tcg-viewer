import { expect, test } from "bun:test";
import { KNOWN_RARITIES } from "../src/components/holo-card/rarity";
import { normalizeTcgdexRarity } from "./normalize-rarity";

test("flips TCGdex word order / casing to ptcg vocab", () => {
	expect(normalizeTcgdexRarity("Holo Rare", undefined)).toBe("Rare Holo");
	expect(normalizeTcgdexRarity("Hyper rare", undefined)).toBe("Hyper Rare");
});

test("derives a foil rarity from suffix when TCGdex rarity is coarse", () => {
	expect(normalizeTcgdexRarity("Ultra Rare", "GX")).toBe("Rare Holo GX");
	expect(normalizeTcgdexRarity("Ultra Rare", "VMAX")).toBe("Rare Holo VMAX");
	expect(normalizeTcgdexRarity("Ultra Rare", "TAG TEAM-GX")).toBe(
		"Rare Holo GX",
	);
});

test("every normalized value is a known foil-table key", () => {
	// Covers: all RARITY_FIX direct mappings + all SUFFIX_FOIL-derived outputs
	const cases: [string, string | undefined][] = [
		// RARITY_FIX entries
		["Holo Rare", undefined],
		["Hyper rare", undefined],
		["Shiny rare", undefined],
		["Shiny rare V", undefined],
		["Full Art Trainer", undefined],
		["ACE SPEC Rare", undefined],
		["Crown", undefined],
		// SUFFIX_FOIL-derived (coarse rarity + mechanic suffix)
		["Rare", "VMAX"],
		["Rare", "VSTAR"],
		["Rare", "GX"],
		["Rare", "V"],
		["Rare", "EX"],
		["Ultra Rare", "VMAX"],
		["Ultra Rare", "VSTAR"],
		["Ultra Rare", "GX"],
		["Ultra Rare", "V"],
		["Ultra Rare", "EX"],
	];
	for (const [rarity, suffix] of cases) {
		const out = normalizeTcgdexRarity(rarity, suffix);
		expect(out).toBeDefined();
		expect(KNOWN_RARITIES.has(out as string)).toBe(true);
	}
});

test("passes through plain rarities unchanged", () => {
	expect(normalizeTcgdexRarity("Common", undefined)).toBe("Common");
	expect(normalizeTcgdexRarity(undefined, undefined)).toBeUndefined();
});

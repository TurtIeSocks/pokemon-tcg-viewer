import { expect, test } from "bun:test";
import { getRarityClass } from "../src/components/holo-card/rarity";
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
	for (const out of [
		normalizeTcgdexRarity("Holo Rare", undefined),
		normalizeTcgdexRarity("Ultra Rare", "V"),
	]) {
		// known keys never hit the "Unknown rarity" generic fallback path
		expect(getRarityClass(out)).not.toBe("no-foil");
	}
});

test("passes through plain rarities unchanged", () => {
	expect(normalizeTcgdexRarity("Common", undefined)).toBe("Common");
	expect(normalizeTcgdexRarity(undefined, undefined)).toBeUndefined();
});

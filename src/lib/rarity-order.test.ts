import { expect, test } from "bun:test";
import { KNOWN_RARITIES } from "../components/holo-card/rarity";
import { compareRarity, RARITY_ORDER, rarityRank } from "./rarity-order";

test("base ladder is ascending: Common < Uncommon < Rare < Rare Holo", () => {
	expect(rarityRank("Common")).toBeLessThan(rarityRank("Uncommon"));
	expect(rarityRank("Uncommon")).toBeLessThan(rarityRank("Rare"));
	expect(rarityRank("Rare")).toBeLessThan(rarityRank("Rare Holo"));
	// Secrets/crowns sit above the base ladder.
	expect(rarityRank("Rare")).toBeLessThan(rarityRank("Rare Secret"));
});

test("rank is case-insensitive (TCGdex sentence case)", () => {
	expect(rarityRank("Double rare")).toBe(rarityRank("Double Rare"));
});

test("unknown / empty rarities sort last", () => {
	expect(rarityRank("Totally Made Up")).toBe(RARITY_ORDER.length);
	expect(rarityRank(null)).toBe(RARITY_ORDER.length);
	expect(rarityRank(undefined)).toBe(RARITY_ORDER.length);
});

test("compareRarity orders a mixed list by rarity, not alphabetically", () => {
	const sorted = ["Rare Secret", "Common", "Rare Holo", "Uncommon"].sort(
		compareRarity,
	);
	expect(sorted).toEqual(["Common", "Uncommon", "Rare Holo", "Rare Secret"]);
});

test("RARITY_ORDER covers every rarity the corpus can carry (no drift)", () => {
	// Every rarity handled by the holo-style map must have an explicit rank, or a
	// real card would sort to the unknown bucket at the end.
	const missing = [...KNOWN_RARITIES].filter(
		(r) => rarityRank(r) === RARITY_ORDER.length,
	);
	expect(missing).toEqual([]);
});

test("RARITY_ORDER has no duplicates", () => {
	expect(new Set(RARITY_ORDER).size).toBe(RARITY_ORDER.length);
});

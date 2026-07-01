import { expect, test } from "bun:test";
import type { CorpusCard } from "../src/store/corpus/corpus-types";
import { mergePtcgOverlay } from "./merge-overlay";

const baseCard = (over: Partial<CorpusCard> = {}): CorpusCard => ({
	id: "base1-4",
	name: "Charizard",
	supertype: "Pokémon",
	setId: "base1",
	number: "4",
	imageBase: "base/base1/4",
	imageUrl: "https://assets.tcgdex.net/en/base/base1/4/high.webp",
	imageUrlSmall: "https://assets.tcgdex.net/en/base/base1/4/low.webp",
	rarity: "Rare", // TCGdex coarse rarity
	subtypes: ["Stage2"], // TCGdex assembled
	...over,
});

test("overlays ptcg rarity, subtypes, and EN images on a crosswalk hit", () => {
	const overlay = new Map([
		["base1-4", { rarity: "Rare Holo", subtypes: ["Stage 2"] }],
	]);
	const { merged, hits } = mergePtcgOverlay([baseCard()], overlay);
	expect(hits).toBe(1);
	expect(merged[0].rarity).toBe("Rare Holo"); // foil-table vocab
	expect(merged[0].subtypes).toEqual(["Stage 2"]);
	expect(merged[0].imageUrl).toBe(
		"https://images.pokemontcg.io/base1/4_hires.png",
	);
	expect(merged[0].imageUrlSmall).toBe(
		"https://images.pokemontcg.io/base1/4.png",
	);
	expect(merged[0].imageBase).toBe("base/base1/4"); // untouched → non-EN still TCGdex
});

test("leaves a card untouched on a crosswalk miss", () => {
	const { merged, hits } = mergePtcgOverlay([baseCard()], new Map());
	expect(hits).toBe(0);
	expect(merged[0].rarity).toBe("Rare");
});

test("empty overlay (crawl failed) returns cards unchanged (keep-last-good)", () => {
	const cards = [baseCard()];
	const { merged } = mergePtcgOverlay(cards, new Map());
	expect(merged[0]).toEqual(cards[0]);
});

test("normalizes rarity on a crosswalk miss when suffixById is provided", () => {
	// Overlay has one entry for a *different* card, so base1-4 is a miss.
	const overlay = new Map([
		["other-1", { rarity: "Rare Holo", subtypes: ["Stage 2"] }],
	]);
	const suffixById = new Map([["base1-4", "GX"]]);
	const card = baseCard({ rarity: "Ultra Rare" });
	const { merged, hits } = mergePtcgOverlay([card], overlay, suffixById);
	expect(hits).toBe(0); // miss — not an overlay hit
	expect(merged[0].rarity).toBe("Rare Holo GX"); // normalized via suffix
});

test("crosswalk miss with no suffix leaves rarity unchanged", () => {
	const overlay = new Map([["other-1", { rarity: "Rare Holo" }]]);
	const card = baseCard({ rarity: "Ultra Rare" });
	const { merged } = mergePtcgOverlay([card], overlay);
	expect(merged[0].rarity).toBe("Ultra Rare");
});

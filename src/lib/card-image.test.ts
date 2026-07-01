import { describe, expect, it } from "bun:test";
import type { CorpusCard } from "@/store/corpus/corpus-types";
import { cardImage } from "./card-image";

const card = (overrides: Partial<CorpusCard> = {}): CorpusCard => ({
	id: "swsh3-136",
	name: "Charizard",
	imageUrl: "https://images.pokemontcg.io/swsh3/136_hires.png",
	imageUrlSmall: "https://images.pokemontcg.io/swsh3/136.png",
	imageBase: "swsh/swsh3/136",
	supertype: "Pokémon",
	setId: "swsh3",
	number: "136",
	...overrides,
});

describe("cardImage", () => {
	it("passes through the baked EN urls when lang is 'en'", () => {
		const c = card();
		expect(cardImage(c, "en")).toEqual({
			imageUrl: c.imageUrl,
			imageUrlSmall: c.imageUrlSmall,
		});
	});

	it("passes through the baked urls when imageBase is null (even for fr)", () => {
		const c = card({ imageBase: null });
		expect(cardImage(c, "fr")).toEqual({
			imageUrl: c.imageUrl,
			imageUrlSmall: c.imageUrlSmall,
		});
	});

	it("passes through the baked urls when imageBase is undefined (even for fr)", () => {
		const c = card({ imageBase: undefined });
		expect(cardImage(c, "fr")).toEqual({
			imageUrl: c.imageUrl,
			imageUrlSmall: c.imageUrlSmall,
		});
	});

	it("derives localized fr webp urls from imageBase", () => {
		expect(cardImage(card(), "fr")).toEqual({
			imageUrl: "https://assets.tcgdex.net/fr/swsh/swsh3/136/high.webp",
			imageUrlSmall: "https://assets.tcgdex.net/fr/swsh/swsh3/136/low.webp",
		});
	});

	// FocusCardData (the detail view) carries no imageUrlSmall — the structural
	// source must still work, falling back to imageUrl for the small variant on en.
	it("accepts a source without imageUrlSmall (detail FocusCardData shape)", () => {
		const focus = { imageBase: "swsh/swsh3/136", imageUrl: "EN_LARGE" };
		expect(cardImage(focus, "en")).toEqual({
			imageUrl: "EN_LARGE",
			imageUrlSmall: "EN_LARGE",
		});
		expect(cardImage(focus, "fr").imageUrl).toBe(
			"https://assets.tcgdex.net/fr/swsh/swsh3/136/high.webp",
		);
	});

	it("derives localized de webp urls from imageBase", () => {
		expect(cardImage(card(), "de")).toEqual({
			imageUrl: "https://assets.tcgdex.net/de/swsh/swsh3/136/high.webp",
			imageUrlSmall: "https://assets.tcgdex.net/de/swsh/swsh3/136/low.webp",
		});
	});
});

import { describe, expect, it, test } from "bun:test";
import type { FocusCardData } from "@/server/card-mappers";
import type { CorpusCard } from "@/store/corpus/corpus-types";
import { cardImage, withCorpusImage } from "./card-image";

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

test("withCorpusImage overrides the live image with the corpus image", () => {
	const live: FocusCardData = {
		id: "neo3-1",
		name: "Zubat",
		supertype: "Pokémon",
		setId: "neo3",
		setName: "Awakening Legends",
		setSeries: "Neo",
		cardNumber: "1",
		imageBase: null,
		imageUrl: "https://images.pokemontcg.io/neo3/1_hires.png", // live fallback
	};
	const out = withCorpusImage(live, {
		imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/575223_400w.jpg",
		imageBase: null,
	});
	expect(out.imageUrl).toBe(
		"https://tcgplayer-cdn.tcgplayer.com/product/575223_400w.jpg",
	);
	expect(out.imageBase).toBeNull();
});

test("withCorpusImage is a no-op when the corpus has no card", () => {
	const live = { imageUrl: "x", imageBase: null } as FocusCardData;
	expect(withCorpusImage(live, undefined)).toBe(live);
});

test("withCorpusImage carries a suppressed blank (card-back, not a wrong image)", () => {
	const live = {
		imageUrl: "https://images.pokemontcg.io/vs1/1.png",
		imageBase: null,
	} as FocusCardData;
	const out = withCorpusImage(live, { imageUrl: "", imageBase: null });
	expect(out.imageUrl).toBe("");
});

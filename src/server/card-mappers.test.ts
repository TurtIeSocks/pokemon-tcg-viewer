import { describe, expect, test } from "bun:test";
import { variantLabel } from "../lib/card-variants";
import type { CorpusCard } from "../store/corpus/corpus-types";
import type { TcgdexFocusCard } from "./card-mappers";
import {
	apiCardToFocusProps,
	corpusCardToFocus,
	mapTcgdexFocusCard,
} from "./card-mappers";

test("mapTcgdexFocusCard coerces numeric hp and attack damage to strings", () => {
	const f = mapTcgdexFocusCard({
		id: "swsh3-1",
		localId: "1",
		name: "Bulbasaur",
		category: "Pokemon",
		set: { id: "swsh3", name: "Darkness Ablaze" },
		hp: 70 as unknown as string, // API returns number
		attacks: [
			{ name: "Vine Whip", cost: ["Grass"], damage: 30 as unknown as string },
		],
	});
	expect(f.hp).toBe("70");
	expect(typeof f.hp).toBe("string");
	expect(f.attacks?.[0].damage).toBe("30");
	expect(typeof f.attacks?.[0].damage).toBe("string");
});

test("mapTcgdexFocusCard maps core fields and drops pricing", () => {
	const f = mapTcgdexFocusCard({
		id: "swsh3-136",
		localId: "136",
		name: "Furret",
		category: "Pokemon",
		image: "https://assets.tcgdex.net/en/swsh/swsh3/136",
		set: { id: "swsh3", name: "Darkness Ablaze" },
		illustrator: "Mitsuhiro Arita",
		rarity: "Uncommon",
		pricing: { cardmarket: { avg: 0.5 }, tcgplayer: { market: 0.4 } },
	} as never);
	expect(f.id).toBe("swsh3-136");
	expect(f.name).toBe("Furret");
	expect(f.artist).toBe("Mitsuhiro Arita");
	expect(f.imageUrl).toBe(
		"https://assets.tcgdex.net/en/swsh/swsh3/136/high.webp",
	);
	expect("tcgplayer" in f).toBe(false);
	expect("cardmarket" in f).toBe(false);
});

test("mapTcgdexFocusCard assembles subtypes + accented supertype (TCGdex has neither field)", () => {
	const f = mapTcgdexFocusCard({
		id: "base1-4",
		localId: "4",
		name: "Charizard",
		category: "Pokemon",
		set: { id: "base1", name: "Base" },
		stage: "Stage2",
	} as never);
	expect(f.subtypes).toEqual(["Stage2"]); // assembled, not read from a `subtypes` field
	expect(f.supertype).toBe("Pokémon"); // accented, from category
	// setSeries/setReleaseDate are joined from the nav tree by the caller, not here.
	expect(f.setSeries).toBe("");
	expect(f.setReleaseDate).toBeUndefined();
});

test("mapTcgdexFocusCard maps TCGdex dexId to nationalPokedexNumbers", () => {
	// TCGdex sends `dexId`; reading the wrong field dropped the Pokemon
	// "View all <species>" cross-link on the detail view.
	const f = mapTcgdexFocusCard({
		id: "base1-1",
		localId: "1",
		name: "Alakazam",
		category: "Pokemon",
		set: { id: "base1", name: "Base" },
		dexId: [65],
	} as never);
	expect(f.nationalPokedexNumbers).toEqual([65]);
});

test("mapTcgdexFocusCard maps variants_detailed, null-filling absent optionals", () => {
	const out = mapTcgdexFocusCard({
		id: "base1-4",
		localId: "4",
		name: "Charizard",
		category: "Pokemon",
		image: "https://assets.tcgdex.net/en/base/base1/4",
		set: { id: "base1", name: "Base" },
		variants_detailed: [
			{ type: "holo", subtype: "unlimited", size: "standard", variantId: "a" },
			{
				type: "holo",
				subtype: "shadowless",
				size: "standard",
				stamp: ["1st-edition"],
				variantId: "b",
			},
		],
	} as TcgdexFocusCard);

	expect(out.variantsDetailed).toEqual([
		{
			variantId: "a",
			type: "holo",
			subtype: "unlimited",
			size: "standard",
			stamp: null,
		},
		{
			variantId: "b",
			type: "holo",
			subtype: "shadowless",
			size: "standard",
			stamp: ["1st-edition"],
		},
	]);
	const second = out.variantsDetailed?.[1];
	if (!second) throw new Error("expected a second mapped variant");
	expect(variantLabel(second)).toBe("1st Edition · Shadowless · Holo");
});

test("mapTcgdexFocusCard leaves variantsDetailed undefined when absent", () => {
	const out = mapTcgdexFocusCard({
		id: "sm1-1",
		localId: "1",
		name: "Rowlet",
		category: "Pokemon",
		set: { id: "sm1", name: "Sun & Moon" },
	} as TcgdexFocusCard);
	expect(out.variantsDetailed).toBeUndefined();
});

describe("apiCardToFocusProps", () => {
	test("carries attacks through", () => {
		const out = apiCardToFocusProps({
			id: "swsh9-154",
			name: "Charizard VSTAR",
			supertype: "Pokémon",
			number: "154",
			set: {
				id: "swsh9",
				name: "Brilliant Stars",
				series: "Sword & Shield",
				images: { logo: "logo.png" },
			},
			images: { small: "s", large: "l" },
			attacks: [{ name: "Star Blaze", damage: "320" }],
		});
		expect(out.setLogo).toBe("logo.png");
		expect(out.attacks?.[0]?.name).toBe("Star Blaze");
	});
});

describe("corpusCardToFocus", () => {
	const overlayCard: CorpusCard = {
		id: "SV1a-001",
		name: "Pikachu",
		imageUrl: "https://tcgplayer.example/400/SV1a-001",
		imageUrlSmall: "https://tcgplayer.example/200/SV1a-001",
		imageBase: null,
		rarity: "Art Rare",
		supertype: "Pokémon",
		types: ["Lightning"],
		setId: "SV1a",
		number: "001",
	};

	test("synthesizes a FocusCardData from a corpus-only overlay card + set", () => {
		const f = corpusCardToFocus(overlayCard, {
			name: "Triplet Beat",
			series: "Scarlet & Violet",
			releaseDate: "2023-03-17",
			logo: "logo.png",
		});
		expect(f.id).toBe("SV1a-001");
		expect(f.name).toBe("Pikachu");
		expect(f.imageUrl).toBe("https://tcgplayer.example/400/SV1a-001");
		expect(f.imageBase).toBeNull();
		expect(f.rarity).toBe("Art Rare");
		expect(f.supertype).toBe("Pokémon");
		expect(f.setId).toBe("SV1a");
		expect(f.setName).toBe("Triplet Beat");
		expect(f.setSeries).toBe("Scarlet & Violet");
		expect(f.setReleaseDate).toBe("2023-03-17");
		expect(f.setLogo).toBe("logo.png");
		expect(f.cardNumber).toBe("001");
	});

	test("leaves battle fields undefined (overlay source carries none)", () => {
		const f = corpusCardToFocus(overlayCard, {
			name: "Triplet Beat",
			series: "Scarlet & Violet",
		});
		expect(f.attacks).toBeUndefined();
		expect(f.abilities).toBeUndefined();
		expect(f.hp).toBeUndefined();
		expect(f.weaknesses).toBeUndefined();
		expect(f.flavorText).toBeUndefined();
	});
});

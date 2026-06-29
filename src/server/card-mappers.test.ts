import { describe, expect, test } from "bun:test";
import {
	apiCardToFocusProps,
	apiCardToProps,
	mapTcgdexFocusCard,
} from "./card-mappers";

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

describe("apiCardToProps", () => {
	test("maps prices keys to variants", () => {
		const out = apiCardToProps({
			id: "swsh9-154",
			name: "Charizard VSTAR",
			supertype: "Pokémon",
			number: "154",
			set: { id: "swsh9", name: "Brilliant Stars", series: "Sword & Shield" },
			images: { small: "s.png", large: "l.png" },
			tcgplayer: { prices: { holofoil: {}, reverseHolofoil: {} } },
		});
		expect(out.variants).toEqual(["holofoil", "reverseHolofoil"]);
		expect(out.imageUrl).toBe("l.png");
		expect(out.setSeries).toBe("Sword & Shield");
	});
	test("variants is undefined when no prices", () => {
		const out = apiCardToProps({
			id: "base1-4",
			name: "Charizard",
			supertype: "Pokémon",
			number: "4",
			set: { id: "base1", name: "Base", series: "Base" },
			images: { small: "s", large: "l" },
		});
		expect(out.variants).toBeUndefined();
	});
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

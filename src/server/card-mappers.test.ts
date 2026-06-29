import { describe, expect, test } from "bun:test";
import { apiCardToFocusProps, mapTcgdexFocusCard } from "./card-mappers";

test("mapTcgdexFocusCard coerces numeric hp and attack damage to strings", () => {
	const f = mapTcgdexFocusCard({
		id: "swsh3-1",
		localId: "1",
		name: "Bulbasaur",
		category: "Pokemon",
		set: { id: "swsh3", name: "Darkness Ablaze" },
		hp: 70 as unknown as string, // API returns number
		attacks: [{ name: "Vine Whip", cost: ["Grass"], damage: 30 as unknown as string }],
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

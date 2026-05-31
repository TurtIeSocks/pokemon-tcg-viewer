import { describe, expect, test } from "bun:test";
import { apiCardToFocusProps, apiCardToProps } from "./card-mappers";

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
	test("carries attacks and tcgplayer through", () => {
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

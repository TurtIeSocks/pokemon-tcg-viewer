import { expect, test } from "bun:test";
import { trimCard } from "./build-corpus";

const apiCard = {
	id: "hgss4-1",
	name: "Aggron",
	number: "1",
	supertype: "Pokémon",
	subtypes: ["Stage 2"],
	rarity: "Rare Holo",
	types: ["Metal"],
	nationalPokedexNumbers: [306],
	set: { id: "hgss4", name: "HS—Triumphant", series: "HeartGold & SoulSilver" },
	images: {
		small: "https://images.pokemontcg.io/hgss4/1.png",
		large: "https://images.pokemontcg.io/hgss4/1_hires.png",
	},
	tcgplayer: { prices: { holofoil: {}, reverseHolofoil: {} } },
};

test("trimCard keeps only corpus fields and derives variants", () => {
	expect(trimCard(apiCard)).toEqual({
		id: "hgss4-1",
		name: "Aggron",
		imageUrl: "https://images.pokemontcg.io/hgss4/1_hires.png",
		imageUrlSmall: "https://images.pokemontcg.io/hgss4/1.png",
		rarity: "Rare Holo",
		subtypes: ["Stage 2"],
		supertype: "Pokémon",
		types: ["Metal"],
		setId: "hgss4",
		number: "1",
		nationalPokedexNumbers: [306],
		variants: ["holofoil", "reverseHolofoil"],
	});
});

test("trimCard omits variants when tcgplayer prices are absent", () => {
	const c = trimCard({ ...apiCard, tcgplayer: undefined });
	expect(c.variants).toBeUndefined();
});

import { expect, test } from "bun:test";
import type { CorpusCard } from "../src/store/corpus/corpus-types";
import { mergeTcgcsvOverlay, productToCard } from "./tcgcsv-overlay";

const product = (
	over: Partial<{
		productId: number;
		name: string;
		ext: Record<string, string>;
	}> = {},
) => ({
	productId: over.productId ?? 24601,
	name: over.name ?? "Weezing",
	extendedData: Object.entries(
		over.ext ?? { Number: "014/055", HP: "80", CardType: "Grass" },
	).map(([name, value]) => ({ name, value })),
});

test("mints a Pokemon card from a tcgcsv product (number, image, type, rarity)", () => {
	const c = productToCard(
		product({
			ext: {
				Number: "014/055",
				HP: "80",
				CardType: "Grass",
				Rarity: "Uncommon",
			},
		}),
		"ADV1",
	);
	expect(c.id).toBe("ADV1-14"); // leading-zero-stripped local id
	expect(c.number).toBe("14");
	expect(c.supertype).toBe("Pokémon");
	expect(c.types).toEqual(["Grass"]);
	expect(c.rarity).toBe("Uncommon");
	expect(c.imageUrl).toBe(
		"https://tcgplayer-cdn.tcgplayer.com/product/24601_400w.jpg",
	);
	expect(c.imageBase).toBeNull();
});

test("classifies a Trainer (no HP, non-energy CardType) and drops 'None' rarity", () => {
	const c = productToCard(
		product({
			name: "Potion",
			ext: { Number: "070/080", CardType: "Item", Rarity: "None" },
		}),
		"ADV4",
	);
	expect(c.supertype).toBe("Trainer");
	expect(c.rarity).toBeUndefined();
	expect(c.types).toBeUndefined();
});

test("falls back to productId as local id when Number is absent", () => {
	const c = productToCard(
		product({ productId: 9999, ext: { HP: "60", CardType: "Water" } }),
		"PCG1",
	);
	expect(c.id).toBe("PCG1-9999");
});

test("mergeTcgcsvOverlay appends only ids the base lacks (TCGdex wins)", () => {
	const base: CorpusCard[] = [
		{
			id: "ADV1-1",
			name: "Real TCGdex",
			supertype: "Pokémon",
			setId: "ADV1",
			number: "1",
			imageUrl: "x",
			imageUrlSmall: "y",
		},
	];
	const overlay = [
		productToCard(product({ ext: { Number: "001/055", HP: "50" } }), "ADV1"), // ADV1-1: collides → skipped
		productToCard(product({ ext: { Number: "002/055", HP: "70" } }), "ADV1"), // ADV1-2: new → added
	];
	const { merged, added } = mergeTcgcsvOverlay(base, overlay);
	expect(added).toBe(1);
	expect(merged).toHaveLength(2);
	expect(merged.find((c) => c.id === "ADV1-1")?.name).toBe("Real TCGdex"); // not overwritten
});

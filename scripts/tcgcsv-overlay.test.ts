import { expect, test } from "bun:test";
import type { CorpusCard } from "../src/store/corpus/corpus-types";
import { mergeTcgcsvOverlay, productToCard } from "./tcgcsv-overlay";

// Paras = national dex 46, Golbat = 42.
const NAME_TO_DEX = new Map([
	["paras", 46],
	["golbat", 42],
]);

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

test("ADD: appends overlay cards for a set TCGdex has none of (empty set)", () => {
	const base: CorpusCard[] = []; // ADV1 entirely absent from TCGdex
	const overlay = [
		productToCard(product({ ext: { Number: "001/055", HP: "50" } }), "ADV1"),
		productToCard(product({ ext: { Number: "002/055", HP: "70" } }), "ADV1"),
	];
	const { merged, added, filled } = mergeTcgcsvOverlay(base, overlay);
	expect(added).toBe(2);
	expect(filled).toBe(0);
	expect(merged).toHaveLength(2);
});

test("FILL: replaces the image on a base card with no TCGdex scan (imageBase null)", () => {
	// TCGdex has the card + metadata but no scan → build left a ptcg English fallback.
	const base: CorpusCard[] = [
		{
			id: "neo3-001",
			name: "Zubat",
			supertype: "Pokémon",
			setId: "neo3",
			number: "001",
			imageBase: null,
			imageUrl: "https://images.pokemontcg.io/neo3/1.png",
			imageUrlSmall: "https://images.pokemontcg.io/neo3/1.png",
		},
	];
	// overlay number "001/057" → localId "1"; matched to base "001" via setNumKey.
	const overlay = [
		productToCard(
			product({ productId: 575205, ext: { Number: "001/057", HP: "50" } }),
			"neo3",
		),
	];
	const { merged, added, filled } = mergeTcgcsvOverlay(base, overlay);
	expect(added).toBe(0); // not a new card — the set exists in the base
	expect(filled).toBe(1);
	expect(merged[0].id).toBe("neo3-001"); // TCGdex id kept
	expect(merged[0].imageUrl).toBe(
		"https://tcgplayer-cdn.tcgplayer.com/product/575205_400w.jpg",
	);
});

test("never touches a base card that already has a TCGdex scan, nor invents cards", () => {
	const base: CorpusCard[] = [
		{
			id: "sv1-1",
			name: "Sprigatito",
			supertype: "Pokémon",
			setId: "sv1",
			number: "1",
			imageBase: "sv/sv1/1",
			imageUrl: "https://assets.tcgdex.net/ja/sv/sv1/1/high.webp",
			imageUrlSmall: "x",
		},
	];
	const overlay = [
		productToCard(product({ ext: { Number: "001/258", HP: "70" } }), "sv1"), // matches sv1-1 but base has a scan → untouched
		productToCard(product({ ext: { Number: "999/258", HP: "70" } }), "sv1"), // extra tcgcsv promo → NOT added (set present in base)
	];
	const { merged, added, filled } = mergeTcgcsvOverlay(base, overlay);
	expect(added).toBe(0);
	expect(filled).toBe(0);
	expect(merged).toHaveLength(1);
	expect(merged[0].imageBase).toBe("sv/sv1/1"); // untouched
});

test("FUZZY: fills a JP-named card via English-name→national-dex bridge", () => {
	// TCGdex ja name is Japanese (パラ = Paras) and there's no tcgcsv card number,
	// so only the dex bridge can match it.
	const base: CorpusCard[] = [
		{
			id: "neo3-002",
			name: "パラ",
			supertype: "Pokémon",
			setId: "neo3",
			number: "002",
			imageBase: null,
			imageUrl: "", // blank — tcgcsv old-era has no numbers, number pass misses
			imageUrlSmall: "",
			nationalPokedexNumbers: [46],
		},
	];
	// tcgcsv product "Paras" with NO Number field → localId falls back to productId.
	const overlay = [
		productToCard(
			product({ productId: 575210, name: "Paras", ext: { HP: "40" } }),
			"neo3",
		),
	];
	const { filled, filledFuzzy, merged } = mergeTcgcsvOverlay(base, overlay, {
		nameToDex: NAME_TO_DEX,
	});
	expect(filled).toBe(0); // number pass can't match
	expect(filledFuzzy).toBe(1); // dex bridge matched Paras → 46
	expect(merged[0].imageUrl).toBe(
		"https://tcgplayer-cdn.tcgplayer.com/product/575210_400w.jpg",
	);
});

test("FUZZY: never guesses on a dex tie (two same-species cards)", () => {
	const base: CorpusCard[] = [
		{
			id: "neo3-004",
			name: "ゴルバット",
			supertype: "Pokémon",
			setId: "neo3",
			number: "004",
			imageBase: null,
			imageUrl: "",
			imageUrlSmall: "",
			nationalPokedexNumbers: [42],
		},
	];
	const overlay = [
		productToCard(
			product({ productId: 1, name: "Golbat", ext: { HP: "80" } }),
			"neo3",
		),
		productToCard(
			product({ productId: 2, name: "Golbat", ext: { HP: "80" } }),
			"neo3",
		), // two Golbats → ambiguous
	];
	const { filledFuzzy, merged } = mergeTcgcsvOverlay(base, overlay, {
		nameToDex: NAME_TO_DEX,
	});
	expect(filledFuzzy).toBe(0); // tie → skipped, not guessed
	expect(merged[0].imageUrl).toBe("");
});

test("SUPPRESS: blanks a leftover pokemontcg.io fallback (no wrong-language scan)", () => {
	const base: CorpusCard[] = [
		{
			id: "neo3-050",
			name: "Unmatchable",
			supertype: "Trainer",
			setId: "neo3",
			number: "050",
			imageBase: null,
			imageUrl: "https://images.pokemontcg.io/neo3/50.png",
			imageUrlSmall: "https://images.pokemontcg.io/neo3/50.png",
		},
	];
	const { suppressed, merged } = mergeTcgcsvOverlay(base, [], {
		suppressPtcgFallback: true,
	});
	expect(suppressed).toBe(1);
	expect(merged[0].imageUrl).toBe(""); // card-back, not the English scan
});

import { describe, expect, test } from "bun:test";
import { makeFocusCard } from "../test-utils";
import type { CardPriceEntry } from "./corpus/price-types";
import { buildPriceLines } from "./price-lines";

const card = makeFocusCard({
	id: "base1-4",
	name: "Charizard",
	cardNumber: "4",
});
const meta = { tpDate: "2026-07-03", cmDate: "2026-07-02" };

describe("buildPriceLines", () => {
	test("returns [] for a card with no price entry", () => {
		expect(buildPriceLines(card, null, meta)).toEqual([]);
	});

	test("builds a tcgplayer line per finish + a cardmarket line", () => {
		const entry: CardPriceEntry = {
			tp: { N: [700, 400], H: [72034, 53499] },
			cm: [50168, 27674, 40096, 56391],
		};
		const lines = buildPriceLines(card, entry, meta);
		// tcgplayer finishes first (in N,H,R,1H,1N order), then cardmarket.
		expect(lines.map((l) => [l.source, l.finish, l.priceLabel])).toEqual([
			["TCGplayer", "Normal", "$7.00"],
			["TCGplayer", "Holofoil", "$720.34"],
			["Cardmarket", null, "€501.68"],
		]);
		expect(lines[0].updatedAt).toBe("2026-07-03");
		expect(lines[2].updatedAt).toBe("2026-07-02");
	});

	test("tcgplayer line links to a TCGplayer search for the card", () => {
		const entry: CardPriceEntry = { tp: { H: [72034, 53499] } };
		const [line] = buildPriceLines(card, entry, meta);
		expect(line.url).toBe(
			"https://www.tcgplayer.com/search/pokemon/product?q=Charizard%204",
		);
	});

	test("tcgplayer line links DIRECTLY to the product page when tpId is present", () => {
		const entry: CardPriceEntry = {
			tp: { N: [700, 400], H: [72034, 53499] },
			tpId: 107006,
		};
		const lines = buildPriceLines(card, entry, meta);
		// every tcgplayer finish shares the one direct product URL (no slug needed)
		for (const line of lines.filter((l) => l.source === "TCGplayer")) {
			expect(line.url).toBe("https://www.tcgplayer.com/product/107006");
		}
	});

	test("cardmarket line links to a Cardmarket search for the card", () => {
		const entry: CardPriceEntry = { cm: [50168, 27674, 40096, 56391] };
		const [line] = buildPriceLines(card, entry, meta);
		expect(line.source).toBe("Cardmarket");
		expect(line.url).toBe(
			"https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Charizard",
		);
	});

	test("skips a finish whose market price is null", () => {
		const entry: CardPriceEntry = { tp: { N: [null, 400], H: [72034, null] } };
		const lines = buildPriceLines(card, entry, meta);
		expect(lines.map((l) => l.finish)).toEqual(["Holofoil"]);
	});

	test("skips the cardmarket line when trend is null", () => {
		const entry: CardPriceEntry = { cm: [null, 27674, 40096, 56391] };
		expect(buildPriceLines(card, entry, meta)).toEqual([]);
	});
});

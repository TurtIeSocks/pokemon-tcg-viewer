import { describe, expect, test } from "bun:test";
import { makeFocusCard } from "../test-utils";
import { buildPriceLines } from "./price-lines";

const base = makeFocusCard();

describe("buildPriceLines", () => {
	test("TCGPlayer market price line", () => {
		const lines = buildPriceLines({
			...base,
			tcgplayer: {
				url: "http://tcg",
				updatedAt: "2024",
				prices: { holofoil: { market: 12.5 } },
			},
		});
		expect(lines).toHaveLength(1);
		expect(lines[0].source).toBe("TCGPlayer");
		expect(lines[0].priceLabel).toBe("$12.50 market");
	});
	test("Cardmarket avg line", () => {
		const lines = buildPriceLines({
			...base,
			cardmarket: {
				url: "http://cm",
				updatedAt: "2024",
				prices: { averageSellPrice: 9.4 },
			},
		});
		expect(lines[0].source).toBe("Cardmarket");
		expect(lines[0].priceLabel).toBe("€9.40 avg");
	});
	test("no price data → empty", () => {
		expect(buildPriceLines(base)).toEqual([]);
	});
});

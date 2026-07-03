import { expect, test } from "bun:test";
import type { FxTable, PriceIdsMap } from "../src/lib/corpus/price-types";
import {
	type CmGuideRecord,
	joinPrices,
	type TcgcsvPriceRecord,
} from "./build-prices";

const fx: FxTable = { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } };
const sources = { tp: "2026-07-03", cm: "2026-07-03" };

const priceIds: PriceIdsMap = {
	"base1-4": [273699, 42382], // both marketplaces
	"sv2a-151": [719604, null], // cardmarket only (ja)
	"swsh3-136": [null, 219333], // tcgplayer only, two finishes
	"xy1-1": [999999, 888888], // ids present but absent from both feeds
};

const cmGuide: CmGuideRecord[] = [
	{
		idProduct: 273699,
		trend: 501.68,
		avg1: 276.74,
		avg7: 400.96,
		avg30: 563.91,
	},
	{ idProduct: 719604, trend: 0.94, avg1: 1.5, avg7: null, avg30: 0.92 },
];

const tpPrices: TcgcsvPriceRecord[] = [
	{
		productId: 42382,
		marketPrice: 720.34,
		lowPrice: 534.99,
		subTypeName: "Holofoil",
	},
	{
		productId: 219333,
		marketPrice: 0.07,
		lowPrice: 0.04,
		subTypeName: "Normal",
	},
	{
		productId: 219333,
		marketPrice: 0.36,
		lowPrice: 0.15,
		subTypeName: "Reverse Holofoil",
	},
	{
		productId: 219333,
		marketPrice: 1.23,
		lowPrice: null,
		subTypeName: "Weird Future Subtype",
	},
];

test("joinPrices joins both sources into cents", () => {
	const { blob } = joinPrices({
		priceIds,
		cmGuide,
		tpPrices,
		fx,
		date: "2026-07-03",
		sources,
	});
	expect(blob.v).toBe(1);
	expect(blob.date).toBe("2026-07-03");
	expect(blob.fx.rates.USD).toBe(1.09);
	expect(blob.cards["base1-4"]).toEqual({
		tp: { H: [72034, 53499] },
		cm: [50168, 27674, 40096, 56391],
	});
});

test("joinPrices handles single-source cards and multi-finish products", () => {
	const { blob } = joinPrices({
		priceIds,
		cmGuide,
		tpPrices,
		fx,
		date: "2026-07-03",
		sources,
	});
	expect(blob.cards["sv2a-151"]).toEqual({ cm: [94, 150, null, 92] });
	expect(blob.cards["swsh3-136"]).toEqual({
		tp: { N: [7, 4], R: [36, 15] },
	});
});

test("joinPrices drops feedless cards and reports unknown subtypes", () => {
	const { blob, unknownSubtypes } = joinPrices({
		priceIds,
		cmGuide,
		tpPrices,
		fx,
		date: "2026-07-03",
		sources,
	});
	expect(blob.cards["xy1-1"]).toBeUndefined();
	expect(unknownSubtypes).toEqual(["Weird Future Subtype"]);
});

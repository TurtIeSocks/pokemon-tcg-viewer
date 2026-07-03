import { expect, test } from "bun:test";
import type { CardVariant } from "@/lib/card-variants";
import type { CardPriceEntry, FxTable } from "@/lib/corpus/price-types";
import {
	conditionMultiplier,
	finishForPrinting,
	stackValueUsdCents,
	unitMarketValueUsdCents,
} from "./valuation";

const fx: FxTable = { base: "EUR", date: "x", rates: { USD: 1.09 } };
const printing = (over: Partial<CardVariant>): CardVariant => ({
	variantId: "v",
	type: "normal",
	subtype: null,
	size: null,
	stamp: null,
	...over,
});

test("finishForPrinting maps type/stamp to a tcgplayer finish", () => {
	expect(finishForPrinting(null)).toBeNull();
	expect(finishForPrinting(printing({ type: "reverse" }))).toBe("R");
	expect(finishForPrinting(printing({ type: "holo" }))).toBe("H");
	expect(finishForPrinting(printing({ type: "normal" }))).toBe("N");
	expect(
		finishForPrinting(printing({ type: "holo", stamp: ["1st-edition"] })),
	).toBe("1H");
	expect(
		finishForPrinting(printing({ type: "normal", stamp: ["1st-edition"] })),
	).toBe("1N");
});

test("conditionMultiplier: raw scale; graded values at raw NM (1)", () => {
	expect(conditionMultiplier({ condition: "NM", grading: null })).toBe(1);
	expect(conditionMultiplier({ condition: "LP", grading: null })).toBe(0.85);
	expect(conditionMultiplier({ condition: "DMG", grading: null })).toBe(0.4);
	expect(conditionMultiplier({ condition: null, grading: null })).toBe(1);
	// graded → 1 regardless of any condition
	expect(
		conditionMultiplier({
			condition: "LP",
			grading: { company: "PSA", grade: 9, cert: null },
		}),
	).toBe(1);
});

test("unitMarketValueUsdCents resolves the finish, falls back H→N", () => {
	const entry: CardPriceEntry = { tp: { N: [700, 400], H: [72034, 53499] } };
	// reverse printing not present → fall back to H, then N.
	expect(
		unitMarketValueUsdCents(
			{ printing: printing({ type: "reverse" }) },
			entry,
			fx,
		),
	).toBe(72034);
	// holo printing present → H.
	expect(
		unitMarketValueUsdCents(
			{ printing: printing({ type: "holo" }) },
			entry,
			fx,
		),
	).toBe(72034);
	// normal printing → N.
	expect(
		unitMarketValueUsdCents(
			{ printing: printing({ type: "normal" }) },
			entry,
			fx,
		),
	).toBe(700);
});

test("unitMarketValueUsdCents falls back to cardmarket trend converted EUR→USD", () => {
	const entry: CardPriceEntry = { cm: [1000, null, null, null] }; // €10.00 trend
	expect(unitMarketValueUsdCents({ printing: null }, entry, fx)).toBe(1090); // → $10.90
	// no fx → can't convert cardmarket → null
	expect(unitMarketValueUsdCents({ printing: null }, entry, null)).toBeNull();
});

test("unitMarketValueUsdCents is null for an unpriced card", () => {
	expect(unitMarketValueUsdCents({ printing: null }, null, fx)).toBeNull();
	expect(unitMarketValueUsdCents({ printing: null }, {}, fx)).toBeNull();
});

test("stackValueUsdCents = unit × quantity × condition multiplier", () => {
	const entry: CardPriceEntry = { tp: { N: [1000, null] } }; // $10 unit
	// 3 copies, LP (0.85): 1000 × 3 × 0.85 = 2550
	expect(
		stackValueUsdCents(
			{
				printing: printing({ type: "normal" }),
				quantity: 3,
				condition: "LP",
				grading: null,
			},
			entry,
			fx,
		),
	).toBe(2550);
	// unpriced → null
	expect(
		stackValueUsdCents(
			{ printing: null, quantity: 1, condition: "NM", grading: null },
			null,
			fx,
		),
	).toBeNull();
});

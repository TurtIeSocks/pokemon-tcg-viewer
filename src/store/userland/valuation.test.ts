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

test("finishForPrinting: reverse wins over 1st-edition (documented precedence)", () => {
	// finishForPrinting checks type.startsWith("reverse") before the firstEd
	// branch, so a reverse-holo 1st-edition printing resolves to "R", not "1H"/
	// "1N" — tcgplayer has no reverse+1st-edition finish code, so this locks the
	// documented fallback (reverse takes precedence) against regression.
	expect(
		finishForPrinting(printing({ type: "reverse", stamp: ["1st-edition"] })),
	).toBe("R");
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

test("unitMarketValueUsdCents resolves the finish, falls back N→H (conservative base)", () => {
	const entry: CardPriceEntry = { tp: { N: [700, 400], H: [72034, 53499] } };
	// Unresolved printing (this card has no reverse finish) → conservative
	// Normal ($7), NOT the ~100x Holofoil premium ($720). This is the
	// ~10x-inflation fix: a null / unknown-printing stack (every quick-add, scan,
	// CSV, and legacy stack defaults printing to null) must value at the base
	// Normal price the collector most likely owns, not the holo price.
	expect(
		unitMarketValueUsdCents(
			{ printing: printing({ type: "reverse" }) },
			entry,
			fx,
		),
	).toBe(700);
	// Unknown printing (null) → same conservative Normal fallback.
	expect(unitMarketValueUsdCents({ printing: null }, entry, fx)).toBe(700);
	// holo printing present → H (explicit resolution still wins).
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

test("unitMarketValueUsdCents fallthrough: holo-only card still resolves to H when Normal is absent", () => {
	// Vintage holo-only card: no Normal price exists. An unresolved / null
	// printing must still fall THROUGH to the Holofoil price rather than
	// returning null — the N-before-H reorder only reprioritizes the finish
	// fallback, it does not drop any finish that actually has a price.
	const entry: CardPriceEntry = { tp: { H: [72034, 53499] } };
	expect(
		unitMarketValueUsdCents(
			{ printing: printing({ type: "reverse" }) },
			entry,
			fx,
		),
	).toBe(72034);
	expect(unitMarketValueUsdCents({ printing: null }, entry, fx)).toBe(72034);
});

test("unitMarketValueUsdCents: reverse-only card resolves via the R last-resort fallback", () => {
	// Reverse-only card (e.g. WotC movie promos Scizor 33 / Entei 34 / Pichu 35):
	// tcgplayer prices ONLY the Reverse Holofoil finish. Before "R" was appended
	// to MARKET_FINISH_ORDER, a null-printing stack skipped tcgplayer pricing
	// entirely (returned null); now it falls all the way through to R.
	const entry: CardPriceEntry = { tp: { R: [1234, 1000] } };
	expect(unitMarketValueUsdCents({ printing: null }, entry, fx)).toBe(1234);
});

test("unitMarketValueUsdCents: R stays a pure last resort — Normal still wins when priced", () => {
	// A card with BOTH a Normal and a Reverse Holofoil price must still resolve
	// to Normal for a null printing: R is appended LAST, never inserted, so it
	// can't inflate any card that has a Normal/Holo entry.
	const entry: CardPriceEntry = { tp: { N: [700, 400], R: [1234, 1000] } };
	expect(unitMarketValueUsdCents({ printing: null }, entry, fx)).toBe(700);
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

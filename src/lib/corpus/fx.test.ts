import { expect, test } from "bun:test";
import { convertMinorUnits } from "./fx";
import type { FxTable } from "./price-types";

// EUR-based: 1 EUR = 1.09 USD = 184 JPY = 0.86 GBP.
const fx: FxTable = {
	base: "EUR",
	date: "2026-07-03",
	rates: { USD: 1.09, JPY: 184, GBP: 0.86 },
};

test("same currency passes through unchanged", () => {
	expect(convertMinorUnits(1234, "USD", "USD", fx)).toBe(1234);
});

test("null amount stays null", () => {
	expect(convertMinorUnits(null, "USD", "EUR", fx)).toBeNull();
});

test("converts USD→EUR via the EUR base", () => {
	// $10.90 → €10.00 : 1090 cents / 1.09 = 1000 cents.
	expect(convertMinorUnits(1090, "USD", "EUR", fx)).toBe(1000);
});

test("converts EUR→USD (base is EUR, rate 1)", () => {
	// €10.00 → $10.90.
	expect(convertMinorUnits(1000, "EUR", "USD", fx)).toBe(1090);
});

test("converts across exponents USD→JPY (2-dec → 0-dec)", () => {
	// $1.09 = €1.00 = ¥184. 109 USD cents → 184 yen (integer, 0-decimal).
	expect(convertMinorUnits(109, "USD", "JPY", fx)).toBe(184);
});

test("returns null when a rate is unknown", () => {
	expect(convertMinorUnits(1000, "USD", "XYZ", fx)).toBeNull();
	expect(convertMinorUnits(1000, "XYZ", "USD", fx)).toBeNull();
});

import { expect, test } from "bun:test";
import { formatPrice, inputToMinorUnits, minorUnitsToInput } from "./money";

test("inputToMinorUnits scales by the currency exponent", () => {
	expect(inputToMinorUnits("3.50", "USD")).toBe(350);
	expect(inputToMinorUnits("19.99", "USD")).toBe(1999); // float-trap guard
	expect(inputToMinorUnits("350", "JPY")).toBe(350); // 0-decimal: no ×100
	expect(inputToMinorUnits("", "USD")).toBeNull();
	expect(inputToMinorUnits("abc", "JPY")).toBeNull();
});

test("inputToMinorUnits defaults to USD (2-decimal) for back-compat", () => {
	expect(inputToMinorUnits("3.50")).toBe(350);
});

test("minorUnitsToInput inverts by the currency exponent", () => {
	expect(minorUnitsToInput(350, "USD")).toBe("3.5");
	expect(minorUnitsToInput(350, "JPY")).toBe("350");
	expect(minorUnitsToInput(null, "USD")).toBe("");
	expect(minorUnitsToInput(350)).toBe("3.5"); // default USD
});

test("formatPrice renders the exponent-correct amount + symbol", () => {
	expect(formatPrice(350, "USD")).toBe("$3.50");
	expect(formatPrice(350, "JPY")).toBe("¥350"); // 0-decimal
	expect(formatPrice(50168, "EUR")).toBe("€501.68");
	expect(formatPrice(1234, "PLN")).toBe("zł 12.34");
	expect(formatPrice(1000, "XYZ")).toBe("10.00 XYZ"); // unknown symbol → bare code
	expect(formatPrice(null, "USD")).toBe("");
});

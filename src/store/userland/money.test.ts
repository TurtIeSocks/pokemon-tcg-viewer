import { describe, expect, it } from "bun:test";
import { formatPrice, inputToMinorUnits, minorUnitsToInput } from "./money";

describe("inputToMinorUnits", () => {
	it("scales dollars to integer cents", () => {
		expect(inputToMinorUnits("3.50")).toBe(350);
		expect(inputToMinorUnits("3.5")).toBe(350);
		expect(inputToMinorUnits("10")).toBe(1000);
	});

	it("rounds away binary-float drift", () => {
		expect(inputToMinorUnits("19.99")).toBe(1999);
		expect(inputToMinorUnits("0.07")).toBe(7);
	});

	it("maps blank to null but keeps an explicit zero", () => {
		expect(inputToMinorUnits("")).toBeNull();
		expect(inputToMinorUnits("   ")).toBeNull();
		expect(inputToMinorUnits("0")).toBe(0);
	});

	it("rejects non-numeric input as null", () => {
		expect(inputToMinorUnits("free")).toBeNull();
	});
});

describe("minorUnitsToInput", () => {
	it("renders cents as a bare dollar string with no forced zeros", () => {
		expect(minorUnitsToInput(350)).toBe("3.5");
		expect(minorUnitsToInput(1000)).toBe("10");
		expect(minorUnitsToInput(5)).toBe("0.05");
	});

	it("maps null to empty string", () => {
		expect(minorUnitsToInput(null)).toBe("");
	});

	it("round-trips through inputToMinorUnits", () => {
		for (const cents of [0, 5, 350, 1999, 100000]) {
			expect(inputToMinorUnits(minorUnitsToInput(cents))).toBe(cents);
		}
	});
});

describe("formatPrice", () => {
	it("formats known currencies with a symbol and 2dp", () => {
		expect(formatPrice(350, "USD")).toBe("$3.50");
		expect(formatPrice(1999, "EUR")).toBe("€19.99");
		expect(formatPrice(1000, "GBP")).toBe("£10.00");
	});

	it("falls back to a code suffix for unknown currencies", () => {
		expect(formatPrice(350, "CHF")).toBe("3.50 CHF");
	});

	it("maps null to empty string", () => {
		expect(formatPrice(null, "USD")).toBe("");
	});
});

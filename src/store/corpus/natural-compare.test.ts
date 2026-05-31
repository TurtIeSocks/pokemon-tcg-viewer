import { expect, test } from "bun:test";
import { compareCardNumber } from "./natural-compare";

test("orders numeric card numbers numerically, not lexicographically", () => {
	const sorted = ["1", "2", "10", "11", "100", "9"].sort(compareCardNumber);
	expect(sorted).toEqual(["1", "2", "9", "10", "11", "100"]);
});

test("orders alphanumeric promos lexicographically among themselves", () => {
	const sorted = ["TG02", "TG01", "TG10"].sort(compareCardNumber);
	expect(sorted).toEqual(["TG01", "TG02", "TG10"]);
});

test("numeric-leading sort before non-numeric", () => {
	expect(compareCardNumber("5", "SWSH001")).toBeLessThan(0);
	expect(compareCardNumber("SWSH001", "5")).toBeGreaterThan(0);
});

test("same leading integer falls back to string compare", () => {
	expect(compareCardNumber("1a", "1b")).toBeLessThan(0);
});

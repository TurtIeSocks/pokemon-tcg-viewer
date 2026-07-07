import { describe, expect, test } from "bun:test";
import { parseNameText, parseNumberText } from "./parse";

describe("parseNumberText", () => {
	test("modern number/total", () => {
		expect(parseNumberText("086/198")).toEqual({ number: "86", total: 198 });
	});
	test("vintage", () => {
		expect(parseNumberText(" 4/102 ")).toEqual({ number: "4", total: 102 });
	});
	test("secret rare keeps printed denominator", () => {
		expect(parseNumberText("205/198")).toEqual({ number: "205", total: 198 });
	});
	test("OCR confusions: O->0, l->1, S->5, B->8", () => {
		expect(parseNumberText("O86/l98")).toEqual({ number: "86", total: 198 });
		expect(parseNumberText("S1/B2")).toEqual({ number: "51", total: 82 });
	});
	test("promo without total", () => {
		expect(parseNumberText("SWSH123")).toEqual({
			number: "SWSH123",
			total: null,
		});
	});
	test("garbage returns null", () => {
		expect(parseNumberText("@@ ##")).toBeNull();
		expect(parseNumberText("")).toBeNull();
	});
	test("picks number/total out of surrounding OCR noise", () => {
		expect(parseNumberText("Illus. Kagemaru 086/198 ©2022")).toEqual({
			number: "86",
			total: 198,
		});
	});
});

describe("parseNameText", () => {
	test("strips non-letters noise and trims", () => {
		expect(parseNameText("  Pikachu ex |")).toBe("Pikachu ex");
	});
	test("null on empty/garbage", () => {
		expect(parseNameText("###")).toBeNull();
	});
});

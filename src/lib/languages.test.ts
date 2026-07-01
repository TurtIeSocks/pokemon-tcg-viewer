import { describe, expect, it } from "bun:test";
import {
	isSupportedLanguage,
	LANGUAGE_LABELS,
	SUPPORTED_LANGUAGES,
	toSupportedLanguage,
} from "./languages";

describe("supported languages", () => {
	it("is the Phase 1b Western Latin set plus English, en first", () => {
		expect([...SUPPORTED_LANGUAGES]).toEqual([
			"en",
			"fr",
			"de",
			"es",
			"it",
			"pt",
		]);
	});

	it("excludes the Phase 2 (Asian) languages", () => {
		for (const lang of ["ja", "ko", "zh", "zh-tw", "zh-cn"])
			expect(isSupportedLanguage(lang)).toBe(false);
	});

	it("has a label for every supported language", () => {
		for (const lang of SUPPORTED_LANGUAGES)
			expect(LANGUAGE_LABELS[lang]).toBeTruthy();
	});

	it("isSupportedLanguage accepts supported, rejects unsupported", () => {
		expect(isSupportedLanguage("fr")).toBe(true);
		expect(isSupportedLanguage("en")).toBe(true);
		expect(isSupportedLanguage("ja")).toBe(false);
		expect(isSupportedLanguage("xx")).toBe(false);
	});

	it("toSupportedLanguage passes through supported, falls back to en otherwise", () => {
		expect(toSupportedLanguage("de")).toBe("de");
		expect(toSupportedLanguage("ja")).toBe("en");
		expect(toSupportedLanguage(null)).toBe("en");
		expect(toSupportedLanguage(undefined)).toBe("en");
		expect(toSupportedLanguage("")).toBe("en");
	});
});

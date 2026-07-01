import { describe, expect, it } from "bun:test";
import {
	ASIAN_LANGUAGES,
	isSupportedLanguage,
	LANGUAGE_REGION,
	REGION_BASE_LANGUAGE,
	regionForLanguage,
	SUPPORTED_LANGUAGES,
	toSupportedLanguage,
} from "./languages";

describe("region model", () => {
	it("classifies every supported language into a region", () => {
		for (const l of SUPPORTED_LANGUAGES) {
			expect(LANGUAGE_REGION[l]).toBeDefined();
		}
	});
	it("maps Asian langs to asia, Western to west", () => {
		expect(regionForLanguage("ja")).toBe("asia");
		expect(regionForLanguage("zh-tw")).toBe("asia");
		expect(regionForLanguage("en")).toBe("west");
		expect(regionForLanguage("fr")).toBe("west");
	});
	it("unknown language falls back to west", () => {
		expect(regionForLanguage("xx")).toBe("west");
	});
	it("region base languages are en and ja", () => {
		expect(REGION_BASE_LANGUAGE.west).toBe("en");
		expect(REGION_BASE_LANGUAGE.asia).toBe("ja");
	});
	it("ja is now a first-class supported language (not normalized to en)", () => {
		expect(isSupportedLanguage("ja")).toBe(true);
		expect(toSupportedLanguage("ja")).toBe("ja");
	});
	it("ASIAN_LANGUAGES lists exactly the six Asian languages", () => {
		expect([...ASIAN_LANGUAGES].sort()).toEqual([
			"id",
			"ja",
			"ko",
			"th",
			"zh-cn",
			"zh-tw",
		]);
	});
});

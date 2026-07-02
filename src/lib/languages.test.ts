import { describe, expect, it } from "bun:test";
import {
	ASIAN_LANGUAGES,
	faceLanguageFor,
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

describe("faceLanguageFor", () => {
	it("west card + active en -> en face (unchanged)", () => {
		expect(faceLanguageFor({ region: "west" }, "en")).toBe("en");
	});
	it("west card + active ja -> en face (region base, not ja)", () => {
		expect(faceLanguageFor({ region: "west" }, "ja")).toBe("en");
	});
	it("asia card + active en -> ja face (region base)", () => {
		expect(faceLanguageFor({ region: "asia" }, "en")).toBe("ja");
	});
	it("asia card + active ko -> ko face (matches region)", () => {
		expect(faceLanguageFor({ region: "asia" }, "ko")).toBe("ko");
	});
	it("defaults an absent region to west", () => {
		expect(faceLanguageFor({}, "en")).toBe("en");
		expect(faceLanguageFor({}, "ja")).toBe("en");
	});
});

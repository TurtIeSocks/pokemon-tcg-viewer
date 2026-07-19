import { describe, expect, test } from "bun:test";
import {
	type CardLangSearch,
	cardLangSearchMiddlewares,
	validateCardLangSearch,
} from "./card-route-search";

describe("validateCardLangSearch", () => {
	test("coerces the literal string 'null' to a null lang (the ?lang=null repro)", () => {
		expect(validateCardLangSearch({ lang: "null" })).toEqual({ lang: null });
	});

	test("coerces an unsupported code to null", () => {
		expect(validateCardLangSearch({ lang: "xx" })).toEqual({ lang: null });
	});

	test("keeps a supported catalog language", () => {
		expect(validateCardLangSearch({ lang: "de" })).toEqual({ lang: "de" });
	});

	test("defaults a missing lang to null", () => {
		expect(validateCardLangSearch({})).toEqual({ lang: null });
	});

	test("coerces a non-string (JS null) lang to null", () => {
		expect(validateCardLangSearch({ lang: null })).toEqual({ lang: null });
	});
});

describe("cardLangSearchMiddlewares strips the null default from the URL", () => {
	const strip = (search: CardLangSearch): CardLangSearch =>
		cardLangSearchMiddlewares[0]({ search, next: (s) => s });

	test("removes lang when it is the null default, so a cold URL has no ?lang=null", () => {
		expect(strip({ lang: null })).toEqual({} as CardLangSearch);
	});

	test("keeps a concrete language in the URL", () => {
		expect(strip({ lang: "de" })).toEqual({ lang: "de" });
	});
});

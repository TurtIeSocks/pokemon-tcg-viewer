import { expect, test } from "bun:test";
import { isI18nFallback } from "./i18n-active-hooks";

test("isI18nFallback is false for the English steady state (null overlay)", () => {
	expect(isI18nFallback(null, "base1-4")).toBe(false);
});

test("isI18nFallback is true when the active overlay lacks the card", () => {
	const overlay = { lang: "de", namesById: new Map([["base1-9", "X"]]) };
	expect(isI18nFallback(overlay, "base1-4")).toBe(true);
});

test("isI18nFallback is false when the overlay has the card", () => {
	const overlay = { lang: "de", namesById: new Map([["base1-4", "Glurak"]]) };
	expect(isI18nFallback(overlay, "base1-4")).toBe(false);
});

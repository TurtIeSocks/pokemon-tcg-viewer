import { expect, test } from "bun:test";
import {
	defaultCurrencyForLocale,
	exponentFor,
	isSupportedCurrency,
	symbolFor,
	toSupportedCurrency,
} from "./currencies";

test("exponentFor: 2 by default, 0 for zero-decimal currencies", () => {
	expect(exponentFor("USD")).toBe(2);
	expect(exponentFor("EUR")).toBe(2);
	expect(exponentFor("JPY")).toBe(0);
	expect(exponentFor("KRW")).toBe(0);
	expect(exponentFor("XYZ")).toBe(2); // unknown → safe default
});

test("symbolFor returns known symbols, undefined otherwise", () => {
	expect(symbolFor("USD")).toBe("$");
	expect(symbolFor("JPY")).toBe("¥");
	expect(symbolFor("XYZ")).toBeUndefined();
});

test("isSupportedCurrency / toSupportedCurrency", () => {
	expect(isSupportedCurrency("USD")).toBe(true);
	expect(isSupportedCurrency("xyz")).toBe(false);
	expect(toSupportedCurrency("EUR")).toBe("EUR");
	expect(toSupportedCurrency("xyz")).toBe("USD");
	expect(toSupportedCurrency(null)).toBe("USD");
});

test("defaultCurrencyForLocale maps region → currency, falls back to USD", () => {
	expect(defaultCurrencyForLocale("en-GB")).toBe("GBP");
	expect(defaultCurrencyForLocale("ja-JP")).toBe("JPY");
	expect(defaultCurrencyForLocale("de-DE")).toBe("EUR");
	expect(defaultCurrencyForLocale("en-US")).toBe("USD");
	expect(defaultCurrencyForLocale("xx")).toBe("USD"); // no region → USD
	expect(defaultCurrencyForLocale("en-ZZ")).toBe("USD"); // unknown region → USD
});

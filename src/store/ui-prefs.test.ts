import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_PRINT_PREFS, useUiPrefs } from "./ui-prefs";

// ui-prefs is a persisted singleton; mutating it (esp. filtersOpen) leaks across
// test FILES in the shared happy-dom process and collapses the filter panel in
// later search/pokedex control tests. Reset to defaults before AND after each
// test so this file never pollutes another.
const resetPrefs = () =>
	useUiPrefs.setState({ filtersOpen: null, cardMotion: true });

describe("ui-prefs cardMotion", () => {
	beforeEach(resetPrefs);
	afterEach(resetPrefs);

	test("defaults to true (motion on)", () => {
		expect(useUiPrefs.getState().cardMotion).toBe(true);
	});

	test("setCardMotion flips the pref both ways", () => {
		useUiPrefs.getState().setCardMotion(false);
		expect(useUiPrefs.getState().cardMotion).toBe(false);
		useUiPrefs.getState().setCardMotion(true);
		expect(useUiPrefs.getState().cardMotion).toBe(true);
	});

	test("leaves filtersOpen untouched when toggling card motion", () => {
		useUiPrefs.setState({ filtersOpen: false });
		useUiPrefs.getState().setCardMotion(false);
		expect(useUiPrefs.getState().filtersOpen).toBe(false);
	});
});

describe("ui-prefs print defaults", () => {
	test("enable the price line and QR at sensible sizes", () => {
		expect(DEFAULT_PRINT_PREFS.showPrice).toBe(true);
		expect(DEFAULT_PRINT_PREFS.priceSizeMm).toBe(2.8);
		expect(DEFAULT_PRINT_PREFS.showQr).toBe(true);
		expect(DEFAULT_PRINT_PREFS.qrSizeMm).toBe(18);
		expect(DEFAULT_PRINT_PREFS.qrColor).toBe("oklch(0 0 0)");
		expect(DEFAULT_PRINT_PREFS.qrBackground).toBe("oklch(1 0 29.234)");
	});
});

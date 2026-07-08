import { beforeEach, describe, expect, test } from "bun:test";
import { useUiPrefs } from "./ui-prefs";

describe("ui-prefs cardMotion", () => {
	beforeEach(() => {
		useUiPrefs.setState({ cardMotion: true });
	});

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

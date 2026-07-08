import { expect, test } from "bun:test";
import type { HoloCardData } from "../holo-card/types";
import {
	CARD_HEIGHT_MM,
	CARD_WIDTH_MM,
	missingCardViews,
	PRINTABLE_HEIGHT_MM,
	PRINTABLE_WIDTH_MM,
	pageCount,
	placeholderMeta,
	printCountLabel,
	sheetLayout,
} from "./print-missing";

// Minimal hydrated-card factory for the pure derivations (only the fields these
// helpers read need to be present).
function card(overrides: Partial<HoloCardData> = {}): HoloCardData {
	return {
		id: "c",
		imageUrl: "",
		name: "Card",
		setId: "s",
		setName: "Set",
		setSeries: "Series",
		cardNumber: "1",
		...overrides,
	} as HoloCardData;
}

// --- missingCardViews ---

test("missingCardViews returns members whose id is not owned", () => {
	const members = [card({ id: "a" }), card({ id: "b" }), card({ id: "c" })];
	const owned = new Set(["b"]);
	const missing = missingCardViews(members, owned);
	expect(missing.map((m) => m.id)).toEqual(["a", "c"]);
});

test("missingCardViews returns [] when every member is owned", () => {
	const members = [card({ id: "a" }), card({ id: "b" })];
	const owned = new Set(["a", "b"]);
	expect(missingCardViews(members, owned)).toEqual([]);
});

test("missingCardViews returns all members when the owned set is empty", () => {
	const members = [card({ id: "a" }), card({ id: "b" })];
	expect(missingCardViews(members, new Set()).map((m) => m.id)).toEqual([
		"a",
		"b",
	]);
});

test("missingCardViews preserves member order", () => {
	const members = [card({ id: "z" }), card({ id: "a" }), card({ id: "m" })];
	const missing = missingCardViews(members, new Set(["a"]));
	expect(missing.map((m) => m.id)).toEqual(["z", "m"]);
});

// --- printCountLabel ---

test("printCountLabel pluralizes correctly", () => {
	expect(printCountLabel(0)).toBe("0 cards to print");
	expect(printCountLabel(1)).toBe("1 card to print");
	expect(printCountLabel(3)).toBe("3 cards to print");
});

test("printCountLabel contains no em-dash", () => {
	expect(printCountLabel(5)).not.toContain("—");
});

// --- sheetLayout ---

test("sheetLayout default leaves a cutting gap: 2-column, 3-row, 6-per-page grid", () => {
	// The 5mm gap costs the 3rd column (3*63=189mm already ~fills the 190mm width).
	const layout = sheetLayout();
	expect(layout.columns).toBe(2);
	expect(layout.rows).toBe(3);
	expect(layout.perPage).toBe(6);
});

test("sheetLayout with gapMm=0 packs edge-to-edge (3-column, 3-row, 9-per-page)", () => {
	const layout = sheetLayout(
		PRINTABLE_WIDTH_MM,
		PRINTABLE_HEIGHT_MM,
		CARD_WIDTH_MM,
		CARD_HEIGHT_MM,
		0,
	);
	expect(layout).toEqual({ columns: 3, rows: 3, perPage: 9 });
});

test("sheetLayout floors partial columns/rows", () => {
	// Room for 2.x columns and 1.x rows -> 2 x 1.
	const layout = sheetLayout(CARD_WIDTH_MM * 2 + 5, CARD_HEIGHT_MM + 5);
	expect(layout.columns).toBe(2);
	expect(layout.rows).toBe(1);
	expect(layout.perPage).toBe(2);
});

test("sheetLayout never returns negative counts for a tiny page", () => {
	const layout = sheetLayout(10, 10);
	expect(layout.columns).toBe(0);
	expect(layout.rows).toBe(0);
	expect(layout.perPage).toBe(0);
});

// --- pageCount ---

test("pageCount ceils total over perPage", () => {
	expect(pageCount(9, 9)).toBe(1);
	expect(pageCount(10, 9)).toBe(2);
	expect(pageCount(1, 9)).toBe(1);
});

test("pageCount is 0 for empty or degenerate input", () => {
	expect(pageCount(0, 9)).toBe(0);
	expect(pageCount(5, 0)).toBe(0);
});

// --- placeholderMeta ---

test("placeholderMeta formats '#number / setName'", () => {
	expect(placeholderMeta({ cardNumber: "24", setName: "Team Rocket" })).toBe(
		"#24 / Team Rocket",
	);
});

test("placeholderMeta contains no em-dash", () => {
	expect(
		placeholderMeta({ cardNumber: "1", setName: "Base Set" }),
	).not.toContain("—");
});

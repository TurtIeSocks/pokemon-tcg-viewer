import { describe, expect, test } from "bun:test";
import type { ContentRowType } from "@/store/ui-prefs";
import { CONTENT_TYPES, makeContentRow } from "./print-content-types";

const ALL_TYPES: ContentRowType[] = [
	"cardName",
	"number",
	"setName",
	"seriesName",
	"rarity",
	"price",
	"customText",
	"cardImage",
	"qr",
];

const TEXT_TYPES: ContentRowType[] = [
	"cardName",
	"number",
	"setName",
	"seriesName",
	"rarity",
	"price",
];

describe("print content-type registry", () => {
	test("every ContentRowType has a registry entry", () => {
		for (const t of ALL_TYPES) expect(CONTENT_TYPES[t]).toBeDefined();
	});

	test("plain text types expose exactly color/size/ySpacing", () => {
		for (const t of TEXT_TYPES) {
			expect(CONTENT_TYPES[t].fields).toEqual(["color", "size", "ySpacing"]);
		}
	});

	test("customText also exposes a text field", () => {
		expect(CONTENT_TYPES.customText.fields).toEqual([
			"color",
			"size",
			"ySpacing",
			"text",
		]);
	});

	test("cardImage exposes size/ySpacing but no color", () => {
		expect(CONTENT_TYPES.cardImage.fields).toEqual(["size", "ySpacing"]);
		expect(CONTENT_TYPES.cardImage.fields).not.toContain("color");
	});

	test("qr exposes color/backdrop/size/ySpacing", () => {
		expect(CONTENT_TYPES.qr.fields).toEqual([
			"color",
			"backdrop",
			"size",
			"ySpacing",
		]);
	});

	test("labelKeys are consistently named binder_print_row_* i18n keys", () => {
		expect(CONTENT_TYPES.cardName.labelKey).toBe("binder_print_row_card_name");
		expect(CONTENT_TYPES.number.labelKey).toBe("binder_print_row_number");
		expect(CONTENT_TYPES.setName.labelKey).toBe("binder_print_row_set_name");
		expect(CONTENT_TYPES.seriesName.labelKey).toBe(
			"binder_print_row_series_name",
		);
		expect(CONTENT_TYPES.rarity.labelKey).toBe("binder_print_row_rarity");
		expect(CONTENT_TYPES.price.labelKey).toBe("binder_print_row_price");
		expect(CONTENT_TYPES.customText.labelKey).toBe(
			"binder_print_row_custom_text",
		);
		expect(CONTENT_TYPES.cardImage.labelKey).toBe(
			"binder_print_row_card_image",
		);
		expect(CONTENT_TYPES.qr.labelKey).toBe("binder_print_row_qr");
	});

	test("every entry has a positive defaultSizeMm", () => {
		for (const t of ALL_TYPES)
			expect(CONTENT_TYPES[t].defaultSizeMm).toBeGreaterThan(0);
	});
});

describe("makeContentRow", () => {
	test("builds a text row with registry defaults, a fresh uuid + the default text color", () => {
		const row = makeContentRow("cardName");
		expect(row.type).toBe("cardName");
		expect(row.sizeMm).toBe(CONTENT_TYPES.cardName.defaultSizeMm);
		expect(row.color).toBe("oklch(0 0 29.234)");
		expect(row.ySpacingMm).toBeGreaterThan(0);
		expect(row.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
		expect(row.backdrop).toBeUndefined();
		expect(row.text).toBeUndefined();
	});

	test("qr row gets the qr module color + a backdrop, no text", () => {
		const row = makeContentRow("qr");
		expect(row.type).toBe("qr");
		expect(row.sizeMm).toBe(CONTENT_TYPES.qr.defaultSizeMm);
		expect(row.color).toBe("oklch(0 0 0)");
		expect(row.backdrop).toBe("oklch(1 0 29.234)");
		expect(row.text).toBeUndefined();
	});

	test("customText row gets an empty text field, no backdrop", () => {
		const row = makeContentRow("customText");
		expect(row.text).toBe("");
		expect(row.backdrop).toBeUndefined();
	});

	test("cardImage row carries a size but no backdrop/text", () => {
		const row = makeContentRow("cardImage");
		expect(row.sizeMm).toBe(CONTENT_TYPES.cardImage.defaultSizeMm);
		expect(row.backdrop).toBeUndefined();
		expect(row.text).toBeUndefined();
	});

	test("each call mints a unique id", () => {
		expect(makeContentRow("price").id).not.toBe(makeContentRow("price").id);
	});
});

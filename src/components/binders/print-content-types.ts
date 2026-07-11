import {
	type ContentRow,
	type ContentRowType,
	PRINT_QR_BACKDROP,
	PRINT_QR_COLOR,
	PRINT_ROW_Y_SPACING_MM,
	PRINT_TEXT_COLOR,
} from "@/store/ui-prefs";

/**
 * Registry of the content-row types a collector can stack inside a print
 * placeholder. Drives the "Add row" modal: `fields` says which config controls
 * each type exposes, `defaultSizeMm` seeds a fresh row, and `labelKey` is the
 * i18n message key the UI shows. The label keys need not exist yet — the UI
 * layer adds them; they are named consistently as `binder_print_row_*`.
 */

/** Which config controls a row type exposes in the editor. */
export type ContentRowField =
	| "color"
	| "size"
	| "ySpacing"
	| "backdrop"
	| "text";

export interface ContentTypeSpec {
	/** i18n message key for the type's human label (added by the UI layer). */
	labelKey: string;
	/** Config fields this type exposes, in editor display order. */
	fields: ContentRowField[];
	/** Font size (text/qr) or height (cardImage), in mm, for a new row. */
	defaultSizeMm: number;
}

const TEXT_FIELDS: ContentRowField[] = ["color", "size", "ySpacing"];

export const CONTENT_TYPES: Record<ContentRowType, ContentTypeSpec> = {
	cardName: {
		labelKey: "binder_print_row_card_name",
		fields: TEXT_FIELDS,
		defaultSizeMm: 4.68,
	},
	number: {
		labelKey: "binder_print_row_number",
		fields: TEXT_FIELDS,
		defaultSizeMm: 3.64,
	},
	setName: {
		labelKey: "binder_print_row_set_name",
		fields: TEXT_FIELDS,
		defaultSizeMm: 3.64,
	},
	seriesName: {
		labelKey: "binder_print_row_series_name",
		fields: TEXT_FIELDS,
		defaultSizeMm: 3.64,
	},
	rarity: {
		labelKey: "binder_print_row_rarity",
		fields: TEXT_FIELDS,
		defaultSizeMm: 3.64,
	},
	price: {
		labelKey: "binder_print_row_price",
		fields: TEXT_FIELDS,
		defaultSizeMm: 3.64,
	},
	customText: {
		labelKey: "binder_print_row_custom_text",
		fields: ["color", "size", "ySpacing", "text"],
		defaultSizeMm: 3.64,
	},
	cardImage: {
		labelKey: "binder_print_row_card_image",
		// No color control — the image supplies its own pixels.
		fields: ["size", "ySpacing"],
		defaultSizeMm: 40,
	},
	qr: {
		labelKey: "binder_print_row_qr",
		fields: ["color", "backdrop", "size", "ySpacing"],
		defaultSizeMm: 18,
	},
};

/**
 * Build a fresh {@link ContentRow} for a type, seeded from the registry defaults:
 * a new v4 uuid, the type's `defaultSizeMm`, the default gap, and a sensible
 * default color. QR rows also get a default backdrop; custom-text rows get an
 * empty text literal. `cardImage` keeps a color for shape-completeness even
 * though it's ignored at render.
 */
export function makeContentRow(type: ContentRowType): ContentRow {
	const spec = CONTENT_TYPES[type];
	const row: ContentRow = {
		id: crypto.randomUUID(),
		type,
		sizeMm: spec.defaultSizeMm,
		ySpacingMm: PRINT_ROW_Y_SPACING_MM,
		color: type === "qr" ? PRINT_QR_COLOR : PRINT_TEXT_COLOR,
	};
	if (spec.fields.includes("backdrop")) row.backdrop = PRINT_QR_BACKDROP;
	if (spec.fields.includes("text")) row.text = "";
	return row;
}

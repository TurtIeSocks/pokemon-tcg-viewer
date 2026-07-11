import { m } from "@/paraglide/messages";
import type { HoloCardData } from "../holo-card/types";

/**
 * Real trading-card dimensions in millimetres (63mm x 88mm), matching the scan
 * guide geometry. Placeholders print at this exact physical size so a collector
 * can cut them out and slot them into a real binder.
 */
export const CARD_WIDTH_MM = 63;
export const CARD_HEIGHT_MM = 88;

/**
 * Whitespace (mm) left between adjacent placeholders so a collector (or their
 * kid) has room to cut each one out with scissors instead of slicing along a
 * shared edge. Threaded into {@link sheetLayout} so the grid, page count, and
 * the on-screen preview all agree. Note: 3 cards * 63mm = 189mm already fills the
 * 190mm A4-safe width, so any gap > ~0.5mm drops the grid from 3 columns to 2.
 */
export const PLACEHOLDER_GAP_MM = 5;

/**
 * Printable area (mm) of a standard sheet after margins. A4 is the narrower and
 * shorter printable box of the Letter/A4 pair, so laying out for it fits both:
 * A4 210x297 minus 10mm margins per side -> 190 x 277.
 */
export const PRINTABLE_WIDTH_MM = 190;
export const PRINTABLE_HEIGHT_MM = 277;

/** Grid geometry for one printed sheet of placeholders. */
export interface SheetLayout {
	/** Columns of cards that fit across the printable width. */
	columns: number;
	/** Rows of cards that fit down the printable height. */
	rows: number;
	/** Cards per full sheet (columns x rows). */
	perPage: number;
}

/**
 * How many placeholder cards fit on one printed sheet, accounting for the cutting
 * gap between them. Pure geometry: n cards with (n-1) inter-card gaps fit an axis
 * when `n*card + (n-1)*gap <= printable`, i.e. `n <= (printable + gap)/(card + gap)`.
 * For the default A4-safe box (190 x 277mm), 63 x 88mm cards, and a 5mm gap this is
 * a 2-column, 3-row, 6-per-page grid (also fits US Letter). Pass `gapMm = 0` to pack
 * edge-to-edge (3 x 3 = 9).
 */
export function sheetLayout(
	printableWidthMm: number = PRINTABLE_WIDTH_MM,
	printableHeightMm: number = PRINTABLE_HEIGHT_MM,
	cardWidthMm: number = CARD_WIDTH_MM,
	cardHeightMm: number = CARD_HEIGHT_MM,
	gapMm: number = PLACEHOLDER_GAP_MM,
): SheetLayout {
	const fit = (printable: number, card: number) =>
		Math.max(0, Math.floor((printable + gapMm) / (card + gapMm)));
	const columns = fit(printableWidthMm, cardWidthMm);
	const rows = fit(printableHeightMm, cardHeightMm);
	return { columns, rows, perPage: columns * rows };
}

/** Sheets of paper needed to print `total` cards at `perPage` per sheet. */
export function pageCount(total: number, perPage: number): number {
	if (total <= 0 || perPage <= 0) return 0;
	return Math.ceil(total / perPage);
}

/**
 * Cards the user is missing from a binder: the hydrated member cards whose id is
 * not in the owned set. Pure and the single source of truth for both the
 * printable list and the "N cards to print" count.
 */
export function missingCardViews(
	memberCards: HoloCardData[],
	ownedCardIds: Set<string>,
): HoloCardData[] {
	return memberCards.filter((c) => !ownedCardIds.has(c.id));
}

/** "N cards to print" (singular "1 card to print"). No em-dashes in copy. */
export function printCountLabel(count: number): string {
	return m.binder_print_count_label({ count });
}

/**
 * Identity line printed under a placeholder's name, e.g. "#24 / Team Rocket".
 * Card number then set name, so a collector can match the gap to the checklist.
 */
export function placeholderMeta(
	card: Pick<HoloCardData, "cardNumber" | "setName">,
): string {
	return `#${card.cardNumber} / ${card.setName}`;
}

/**
 * Format a millimetre length, rounded to 0.01mm so float math (3.6 * 1.3) never
 * leaks "5.399999…mm" into the DOM or the printed sheet. Shared by the dialog and
 * the row editor so preview + paper agree on rounding.
 */
export const mm = (n: number) => `${Math.round(n * 100) / 100}mm`;

/** Bounds + display format for one numeric unit-input. */
export interface UnitFieldSpec {
	unit: string;
	min: number;
	max: number;
	step: number;
	precision: number;
}

/**
 * Bounds for each numeric unit-input in the print builder. Column-A card fields
 * (size + frame) plus the per-row size / spacing fields the editor exposes.
 * Defaults + current values live in the persisted store (`useUiPrefs.printPrefs`).
 */
export const PRINT_FIELD = {
	cardWidth: { unit: "mm", min: 20, max: 120, step: 1, precision: 0 },
	cardHeight: { unit: "mm", min: 20, max: 180, step: 1, precision: 0 },
	spacing: { unit: "mm", min: 0, max: 20, step: 0.5, precision: 1 },
	radius: { unit: "mm", min: 0, max: 8, step: 0.5, precision: 1 },
	border: { unit: "mm", min: 0, max: 3, step: 0.1, precision: 2 },
	// A content row's font size (text/qr) or image height. Precision 2 so the
	// default 4.68mm round-trips through the input without truncation.
	rowSize: { unit: "mm", min: 1, max: 80, step: 0.5, precision: 2 },
	rowSpacing: { unit: "mm", min: 0, max: 20, step: 0.5, precision: 1 },
} as const satisfies Record<string, UnitFieldSpec>;

/**
 * Return a NEW array with the item at `index` shifted by `delta` (±1). Pure and
 * total: an out-of-range index/target yields an unchanged copy, so the "move up"
 * on the first row and "move down" on the last are safe no-ops. Drives Column B's
 * reorder buttons (the store replaces `rows` wholesale — never mutate in place).
 */
export function moveRow<T>(
	rows: readonly T[],
	index: number,
	delta: number,
): T[] {
	const target = index + delta;
	if (
		index < 0 ||
		index >= rows.length ||
		target < 0 ||
		target >= rows.length
	) {
		return rows.slice();
	}
	const next = rows.slice();
	const [item] = next.splice(index, 1);
	next.splice(target, 0, item);
	return next;
}

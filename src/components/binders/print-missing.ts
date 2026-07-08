import type { HoloCardData } from "../holo-card/types";

/**
 * Real trading-card dimensions in millimetres (63mm x 88mm), matching the scan
 * guide geometry. Placeholders print at this exact physical size so a collector
 * can cut them out and slot them into a real binder.
 */
export const CARD_WIDTH_MM = 63;
export const CARD_HEIGHT_MM = 88;

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
 * How many placeholder cards fit on one printed sheet. Pure geometry: the floor
 * of printable / card size on each axis. For the default A4-safe printable box
 * (190 x 277mm) with 63 x 88mm cards this is a 3-column, 3-row, 9-per-page grid,
 * which also fits US Letter.
 */
export function sheetLayout(
	printableWidthMm: number = PRINTABLE_WIDTH_MM,
	printableHeightMm: number = PRINTABLE_HEIGHT_MM,
	cardWidthMm: number = CARD_WIDTH_MM,
	cardHeightMm: number = CARD_HEIGHT_MM,
): SheetLayout {
	const columns = Math.max(0, Math.floor(printableWidthMm / cardWidthMm));
	const rows = Math.max(0, Math.floor(printableHeightMm / cardHeightMm));
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
	return `${count} ${count === 1 ? "card" : "cards"} to print`;
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

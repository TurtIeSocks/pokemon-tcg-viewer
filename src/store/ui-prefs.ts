import deepmerge from "deepmerge";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Print-placeholder settings for the "Print missing" binder modal, split into two
 * concerns so the redesign can drive them independently:
 *
 *  - {@link PrintCard} — Column A, the physical placeholder (size, cut gap, frame).
 *  - {@link ContentRow}[] — Column B, a user-composed ordered stack of content
 *    elements (card name, number, price, a QR, custom text, ...). Each row is one
 *    line the collector can add / remove / reorder / restyle.
 *
 * Defaults reproduce today's fixed output: a 63x88mm card, transparent fill, white
 * text, violet border (`--primary`), and the classic name / # / set / price / QR
 * stack at their old effective sizes.
 */

/** Default text color for text + custom-text rows (kept verbatim from the old flat `textColor`). */
export const PRINT_TEXT_COLOR = "oklch(0 0 29.234)";
/** Default QR module color (must stay dark on a light backdrop or it won't scan). */
export const PRINT_QR_COLOR = "oklch(0 0 0)";
/** Default QR backdrop (the white quiet-zone behind the modules). */
export const PRINT_QR_BACKDROP = "oklch(1 0 29.234)";
/** Default gap (mm) below a row — the old `lineGapMm`. */
export const PRINT_ROW_Y_SPACING_MM = 3;

/** Column A — the physical placeholder that gets printed and cut out. */
export interface PrintCard {
	/** Placeholder width in millimetres. Drives how many fit per row. */
	widthMm: number;
	/** Placeholder height in millimetres. Drives how many fit per column. */
	heightMm: number;
	/** Inter-card cut gap on the sheet (mm), for scissor room. Drives the grid too. */
	spacingMm: number;
	/** Corner radius in millimetres (a real trading-card corner). */
	radiusMm: number;
	/** Border thickness in millimetres (SVG stroke width). */
	borderMm: number;
	/** Frame border color. */
	borderColor: string;
	/** Placeholder fill; a transparent default saves ink. */
	fillColor: string;
}

/** The kinds of stacked content a collector can add to a placeholder. */
export type ContentRowType =
	| "cardName"
	| "number"
	| "setName"
	| "seriesName"
	| "rarity"
	| "price"
	| "customText"
	| "cardImage"
	| "qr";

/** Column B — one stacked element inside a placeholder. */
export interface ContentRow {
	/** Stable id (uuid). Ephemeral UI id, so v4 (`crypto.randomUUID()`) is fine. */
	id: string;
	type: ContentRowType;
	/** Font size for text/qr rows; rendered height for `cardImage`. In mm. */
	sizeMm: number;
	/** Gap (mm) BELOW this row. */
	ySpacingMm: number;
	/** Text color / QR module color. Ignored for `cardImage`. */
	color: string;
	/** QR backdrop only. */
	backdrop?: string;
	/** `customText` literal only. */
	text?: string;
}

export interface PrintPrefs {
	card: PrintCard;
	rows: ContentRow[];
}

const DEFAULT_PRINT_CARD: PrintCard = {
	widthMm: 63,
	heightMm: 88,
	spacingMm: 5,
	radiusMm: 3,
	borderMm: 1.0,
	// Site accent violet, kept verbatim from --primary in app.css so they stay matched.
	borderColor: "oklch(0.7 0.19 295)",
	fillColor: "oklch(1 0 29.234 / 0%)",
};

// Stable, deterministic ids so React keys + tests don't depend on Date/random at
// module load. Effective sizes = the old base sizes x the old 1.3 textScale.
const DEFAULT_PRINT_ROWS: ContentRow[] = [
	{
		id: "default-cardName",
		type: "cardName",
		sizeMm: 4.68, // 3.6 * 1.3
		ySpacingMm: PRINT_ROW_Y_SPACING_MM,
		color: PRINT_TEXT_COLOR,
	},
	{
		id: "default-number",
		type: "number",
		sizeMm: 3.64, // 2.8 * 1.3
		ySpacingMm: PRINT_ROW_Y_SPACING_MM,
		color: PRINT_TEXT_COLOR,
	},
	{
		id: "default-setName",
		type: "setName",
		sizeMm: 3.64,
		ySpacingMm: PRINT_ROW_Y_SPACING_MM,
		color: PRINT_TEXT_COLOR,
	},
	{
		id: "default-price",
		type: "price",
		sizeMm: 3.64,
		ySpacingMm: PRINT_ROW_Y_SPACING_MM,
		color: PRINT_TEXT_COLOR,
	},
	{
		id: "default-qr",
		type: "qr",
		sizeMm: 18, // never scaled by textScale
		ySpacingMm: PRINT_ROW_Y_SPACING_MM,
		color: PRINT_QR_COLOR,
		backdrop: PRINT_QR_BACKDROP,
	},
];

export const DEFAULT_PRINT_PREFS: PrintPrefs = {
	card: DEFAULT_PRINT_CARD,
	rows: DEFAULT_PRINT_ROWS,
};

/** Deep-clone so callers/tests can't mutate the shared default constant. */
const clonePrintPrefs = (p: PrintPrefs): PrintPrefs => ({
	card: { ...p.card },
	rows: p.rows.map((r) => ({ ...r })),
});

/** Patch shape for {@link UiPrefsStore.setPrintPrefs}: partial card, whole-array rows. */
export interface PrintPrefsPatch {
	card?: Partial<PrintCard>;
	rows?: ContentRow[];
}

// ---------------------------------------------------------------------------
// Persist migration: old FLAT printPrefs (v0) -> new { card, rows } (v1).
// ---------------------------------------------------------------------------

/** Persist schema version. Bumped when the persisted shape changes. */
export const UI_PREFS_VERSION = 1;

/** The old flat print-prefs shape, kept only to type the migration input. */
export interface LegacyPrintPrefs {
	background: string;
	textColor: string;
	borderColor: string;
	radiusMm: number;
	borderMm: number;
	textScale: number;
	cardWidthMm: number;
	cardHeightMm: number;
	gapMm: number;
	lineGapMm: number;
	showName: boolean;
	nameSizeMm: number;
	showNumber: boolean;
	numberSizeMm: number;
	showSetName: boolean;
	setNameSizeMm: number;
	showPrice: boolean;
	priceSizeMm: number;
	showQr: boolean;
	qrSizeMm: number;
	qrColor: string;
	qrBackground: string;
}

// Round to 2dp so `base * scale` doesn't persist float noise (3.6 * 1.3 -> 4.68).
const roundMm = (n: number) => Math.round(n * 100) / 100;

/** Map one old flat printPrefs into the new { card, rows } shape without data loss. */
function migrateFlatPrintPrefs(old: LegacyPrintPrefs): PrintPrefs {
	const scale = typeof old.textScale === "number" ? old.textScale : 1;
	const gap =
		typeof old.lineGapMm === "number" ? old.lineGapMm : PRINT_ROW_Y_SPACING_MM;

	const card: PrintCard = {
		widthMm: old.cardWidthMm,
		heightMm: old.cardHeightMm,
		spacingMm: old.gapMm,
		radiusMm: old.radiusMm,
		borderMm: old.borderMm,
		borderColor: old.borderColor,
		fillColor: old.background,
	};

	const rows: ContentRow[] = [];
	const textRow = (type: ContentRowType, base: number): ContentRow => ({
		id: `migrated-${type}`,
		type,
		sizeMm: roundMm(base * scale),
		ySpacingMm: gap,
		color: old.textColor,
	});
	// Order is fixed [cardName, number, setName, price, qr]; hidden lines drop out.
	if (old.showName) rows.push(textRow("cardName", old.nameSizeMm));
	if (old.showNumber) rows.push(textRow("number", old.numberSizeMm));
	if (old.showSetName) rows.push(textRow("setName", old.setNameSizeMm));
	if (old.showPrice) rows.push(textRow("price", old.priceSizeMm));
	if (old.showQr)
		rows.push({
			id: "migrated-qr",
			type: "qr",
			sizeMm: old.qrSizeMm, // QR was never scaled by textScale
			ySpacingMm: gap,
			color: old.qrColor,
			backdrop: old.qrBackground,
		});

	return { card, rows };
}

/**
 * Persist `migrate` hook. Converts a pre-v1 persisted blob (flat printPrefs) into
 * the new nested shape, leaving the unrelated `filtersOpen`/`cardMotion` fields
 * untouched. A no-op when there is nothing flat to migrate (already-v1, or a fresh
 * user with no persisted printPrefs).
 */
export function migratePersistedUiPrefs(
	persisted: unknown,
	version: number,
): unknown {
	if (version >= UI_PREFS_VERSION) return persisted;
	if (!persisted || typeof persisted !== "object") return persisted;
	const p = persisted as Record<string, unknown>;
	const flat = p.printPrefs;
	// Only a flat blob has `background`; the new shape has `card`/`rows`.
	if (flat && typeof flat === "object" && "background" in flat) {
		return {
			...p,
			printPrefs: migrateFlatPrintPrefs(flat as LegacyPrintPrefs),
		};
	}
	return persisted;
}

interface UiPrefsStore {
	/**
	 * Filter-panel open state. `null` = follow the viewport default (expanded on
	 * desktop, collapsed on mobile); once the user toggles, their explicit choice
	 * persists across reloads on every viewport.
	 */
	filtersOpen: boolean | null;
	setFiltersOpen: (open: boolean) => void;
	/**
	 * Whether cards run the pointer-tracking 3D tilt + foil (useHoloEffect).
	 * Default `true`. When `false` the tilt is disabled everywhere (cards fall
	 * back to a plain hover lift). `prefers-reduced-motion` always wins and force
	 * disables the tilt regardless of this pref (handled in useHoloEffect).
	 */
	cardMotion: boolean;
	setCardMotion: (on: boolean) => void;
	/** Print-placeholder settings; see {@link PrintPrefs}. */
	printPrefs: PrintPrefs;
	/**
	 * Merge a partial update into the saved print settings. `card` is deep-merged
	 * (patch a single field); `rows` REPLACES the array wholesale (arrays are never
	 * concatenated) — pass the full next ordering.
	 */
	setPrintPrefs: (patch: PrintPrefsPatch) => void;
	/** Restore every print setting to {@link DEFAULT_PRINT_PREFS}. */
	resetPrintPrefs: () => void;
}

type PersistedUiPrefs = Pick<
	UiPrefsStore,
	"filtersOpen" | "cardMotion" | "printPrefs"
>;

// localStorage on the client (synchronous -> rehydrates before first paint, no
// flash); a no-op on the server so importing the store during SSR can't crash.
const storage = createJSONStorage<PersistedUiPrefs>(() =>
	typeof window === "undefined"
		? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
		: localStorage,
);

// Arrays should REPLACE (source wins), never concat, both when rehydrating the
// persisted blob and when patching via setPrintPrefs.
const replaceArrays = {
	arrayMerge: (_target: unknown[], source: unknown[]) => source,
};

export const useUiPrefs = create<UiPrefsStore>()(
	persist(
		(set) => ({
			filtersOpen: null,
			setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
			cardMotion: true,
			setCardMotion: (cardMotion) => set({ cardMotion }),
			printPrefs: clonePrintPrefs(DEFAULT_PRINT_PREFS),
			setPrintPrefs: (patch) =>
				set((s) => ({
					printPrefs: deepmerge<PrintPrefs>(
						s.printPrefs,
						patch as unknown as Partial<PrintPrefs>,
						replaceArrays,
					),
				})),
			resetPrintPrefs: () =>
				set({ printPrefs: clonePrintPrefs(DEFAULT_PRINT_PREFS) }),
		}),
		{
			name: "cardstack-ui-prefs",
			version: UI_PREFS_VERSION,
			storage,
			migrate: (persisted, version) =>
				migratePersistedUiPrefs(persisted, version) as PersistedUiPrefs,
			partialize: (s) => ({
				filtersOpen: s.filtersOpen,
				cardMotion: s.cardMotion,
				printPrefs: s.printPrefs,
			}),
			merge: (persisted, current) =>
				deepmerge(current, persisted as Partial<UiPrefsStore>, replaceArrays),
		},
	),
);

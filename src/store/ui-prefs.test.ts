import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	type ContentRow,
	DEFAULT_PRINT_PREFS,
	migratePersistedUiPrefs,
	useUiPrefs,
} from "./ui-prefs";

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

describe("ui-prefs print defaults (nested card + rows schema)", () => {
	test("card carries today's physical placeholder defaults", () => {
		expect(DEFAULT_PRINT_PREFS.card).toEqual({
			widthMm: 63,
			heightMm: 88,
			spacingMm: 5,
			radiusMm: 3,
			borderMm: 1.0,
			borderColor: "oklch(0.7 0.19 295)",
			fillColor: "oklch(1 0 29.234 / 0%)",
		});
	});

	test("has the 5 expected rows in order with stable ids", () => {
		expect(DEFAULT_PRINT_PREFS.rows.map((r) => r.type)).toEqual([
			"cardName",
			"number",
			"setName",
			"price",
			"qr",
		]);
		expect(DEFAULT_PRINT_PREFS.rows.map((r) => r.id)).toEqual([
			"default-cardName",
			"default-number",
			"default-setName",
			"default-price",
			"default-qr",
		]);
	});

	test("rows carry the current effective sizes + colors", () => {
		const byType = Object.fromEntries(
			DEFAULT_PRINT_PREFS.rows.map((r) => [r.type, r]),
		);
		// old base sizes x the old textScale 1.3.
		expect(byType.cardName.sizeMm).toBe(4.68); // 3.6 * 1.3
		expect(byType.number.sizeMm).toBe(3.64); // 2.8 * 1.3
		expect(byType.setName.sizeMm).toBe(3.64);
		expect(byType.price.sizeMm).toBe(3.64);
		for (const t of ["cardName", "number", "setName", "price"]) {
			expect(byType[t].color).toBe("oklch(0 0 29.234)");
			expect(byType[t].ySpacingMm).toBe(3); // old lineGapMm
		}
		expect(byType.qr.sizeMm).toBe(18); // unscaled by textScale
		expect(byType.qr.color).toBe("oklch(0 0 0)");
		expect(byType.qr.backdrop).toBe("oklch(1 0 29.234)");
		expect(byType.qr.ySpacingMm).toBe(3);
	});
});

describe("ui-prefs migration (flat v0 -> nested v1)", () => {
	const legacy = () => ({
		filtersOpen: false as boolean | null,
		cardMotion: false,
		printPrefs: {
			background: "oklch(1 0 0 / 0%)",
			textColor: "oklch(0.3 0 0)",
			borderColor: "oklch(0.5 0.1 200)",
			radiusMm: 4,
			borderMm: 2,
			textScale: 2, // non-default
			cardWidthMm: 60,
			cardHeightMm: 90,
			gapMm: 8,
			lineGapMm: 5,
			showName: true,
			nameSizeMm: 3.6,
			showNumber: false, // hidden
			numberSizeMm: 2.8,
			showSetName: true,
			setNameSizeMm: 2.8,
			showPrice: false, // hidden
			priceSizeMm: 2.8,
			showQr: true,
			qrSizeMm: 20,
			qrColor: "oklch(0 0 0)",
			qrBackground: "oklch(1 0 0)",
		},
	});

	test("maps card fields from the flat prefs", () => {
		const out = migratePersistedUiPrefs(legacy(), 0) as {
			printPrefs: typeof DEFAULT_PRINT_PREFS;
		};
		expect(out.printPrefs.card).toEqual({
			widthMm: 60,
			heightMm: 90,
			spacingMm: 8,
			radiusMm: 4,
			borderMm: 2,
			borderColor: "oklch(0.5 0.1 200)",
			fillColor: "oklch(1 0 0 / 0%)",
		});
	});

	test("omits hidden lines, scales sizes, carries colors, keeps order", () => {
		const out = migratePersistedUiPrefs(legacy(), 0) as {
			printPrefs: typeof DEFAULT_PRINT_PREFS;
		};
		const rows = out.printPrefs.rows;
		expect(rows.map((r) => r.type)).toEqual(["cardName", "setName", "qr"]);
		const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
		expect(byType.cardName.sizeMm).toBe(7.2); // 3.6 * 2
		expect(byType.setName.sizeMm).toBe(5.6); // 2.8 * 2
		expect(byType.cardName.color).toBe("oklch(0.3 0 0)");
		expect(byType.setName.ySpacingMm).toBe(5); // old lineGapMm
		expect(byType.qr.sizeMm).toBe(20); // unscaled
		expect(byType.qr.color).toBe("oklch(0 0 0)");
		expect(byType.qr.backdrop).toBe("oklch(1 0 0)");
	});

	test("leaves the unrelated filtersOpen + cardMotion intact", () => {
		const out = migratePersistedUiPrefs(legacy(), 0) as {
			filtersOpen: boolean | null;
			cardMotion: boolean;
		};
		expect(out.filtersOpen).toBe(false);
		expect(out.cardMotion).toBe(false);
	});

	test("no-ops an already-migrated (v1) state", () => {
		const already = {
			filtersOpen: null,
			cardMotion: true,
			printPrefs: DEFAULT_PRINT_PREFS,
		};
		expect(migratePersistedUiPrefs(already, 1)).toBe(already);
	});

	test("no-ops when there is no persisted printPrefs (fresh user)", () => {
		const bare = { filtersOpen: true, cardMotion: false };
		expect(migratePersistedUiPrefs(bare, 0)).toBe(bare);
	});
});

describe("ui-prefs setPrintPrefs", () => {
	afterEach(() => useUiPrefs.getState().resetPrintPrefs());

	test("replacing rows REPLACES the array (never concats with the defaults)", () => {
		useUiPrefs.getState().resetPrintPrefs();
		const newRows: ContentRow[] = [
			{
				id: "row-1",
				type: "customText",
				sizeMm: 3,
				ySpacingMm: 2,
				color: "oklch(0 0 0)",
				text: "hello",
			},
		];
		useUiPrefs.getState().setPrintPrefs({ rows: newRows });
		const rows = useUiPrefs.getState().printPrefs.rows;
		expect(rows).toHaveLength(1); // NOT 6 (would be if concatenated)
		expect(rows[0].type).toBe("customText");
	});

	test("patching a single card field leaves the other card fields + rows intact", () => {
		useUiPrefs.getState().resetPrintPrefs();
		useUiPrefs
			.getState()
			.setPrintPrefs({ card: { fillColor: "oklch(0 0 0)" } });
		const pp = useUiPrefs.getState().printPrefs;
		expect(pp.card.fillColor).toBe("oklch(0 0 0)");
		expect(pp.card.widthMm).toBe(63); // untouched
		expect(pp.rows).toHaveLength(5); // untouched
	});

	test("resetPrintPrefs restores the 5 default rows", () => {
		useUiPrefs.getState().setPrintPrefs({ rows: [] });
		expect(useUiPrefs.getState().printPrefs.rows).toHaveLength(0);
		useUiPrefs.getState().resetPrintPrefs();
		expect(useUiPrefs.getState().printPrefs.rows).toHaveLength(5);
	});
});
